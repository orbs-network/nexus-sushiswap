import { Wallet } from "../src/impl/wallet";
import { expect } from "chai";
import { Tokens } from "../src/impl/token";
import { bn, bn18, bn6, ether, many, zero } from "../src/utils";
import {
  deployer,
  balanceETH,
  changeEthPrice,
  nexus,
  startDeployerBalanceETH,
  startNexusBalanceUSDC,
  startPrice,
  totalInvestedUSDC,
  balanceUSDC,
  simulateInterestAccumulation,
} from "./test-e2e-base";
import { expectRevert } from "./test-utils";

describe("LiquidityNexus with Sushiswap single sided ETH/USDC e2e", () => {
  describe("sanity", () => {
    it("sanity", async () => {
      expect(await nexus.methods.USDC().call()).eq(Tokens.eth.USDC().address);
      expect(await nexus.methods.WETH().call()).eq(Tokens.eth.WETH().address);
      expect(await nexus.methods.paused().call()).is.false;
      expect(await nexus.methods.owner().call()).eq(deployer);
      expect(await nexus.methods.totalLiquidity().call()).bignumber.zero;
      expect(await nexus.methods.totalSupply().call()).bignumber.zero;

      expect(await balanceETH()).bignumber.zero;
    });

    it("should revert on improper access", async () => {
      await expectRevert(() => nexus.methods.emergencyExit().send({ from: Wallet.random().address }));
    });
  });

  it("owner can emergency liquidate", async () => {
    expect(await balanceUSDC()).not.bignumber.zero;
    expect(await balanceUSDC(deployer)).bignumber.zero;

    await nexus.methods.emergencyExit().send();

    expect(await nexus.methods.paused().call()).to.be.true;
    expect(await balanceUSDC()).bignumber.zero;
    expect(await balanceUSDC(deployer)).not.bignumber.zero;
  });

  it("user is governor, 100% share, deposit & withdraw", async () => {
    const user = await Wallet.fake(1);
    const startBalance = await user.getBalance();

    await nexus.methods.addLiquidity(bn18("10"), many).send({ from: user.address });
    expect(await user.getBalance()).bignumber.closeTo(startBalance.sub(bn18("10")), ether);

    let account = await nexus.methods.minters(user.address).call();
    expect(account.entryETH).bignumber.closeTo(bn18("10"), bn18("0.1")); // difference due to gas costs
    expect(account.entryUSDC).not.bignumber.zero;
    expect(await nexus.methods.totalSupply().call())
      .bignumber.eq(await nexus.methods.totalLiquidity().call())
      .bignumber.eq(account.liquidity);

    await nexus.methods.removeAllLiquidityETH().send({ from: user.address });
    expect(await user.getBalance()).bignumber.closeTo(startBalance, bn18("0.1"));

    expect(await nexus.methods.totalSupply().call()).eq(await nexus.methods.totalLiquidity().call()).bignumber.zero;
    account = await nexus.methods.minters(user.address).call();
    expect(account.entryETH).bignumber.zero;
    expect(account.entryUSDC).bignumber.zero;
    expect(account.liquidity).bignumber.zero;

    expect(await balanceETH()).bignumber.zero;
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  it("gov deposit for 2 accounts", async () => {
    const user1 = Wallet.random().address;
    const user2 = Wallet.random().address;
    await nexus.methods.addLiquidityETH(user1, many).send({ value: bn18("10") });
    await nexus.methods.addLiquidityETH(user2, many).send({ value: bn18("20") });
    expect(await nexus.methods.removeAllLiquidityETH(user1, many).call()).bignumber.closeTo(bn18("10"), ether);
    expect(await nexus.methods.removeAllLiquidityETH(user2, many).call()).bignumber.closeTo(bn18("20"), ether);
    await Promise.all([
      nexus.methods.removeAllLiquidityETH(user1, many).send(),
      nexus.methods.removeAllLiquidityETH(user2, many).send(),
    ]);
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  it("gracefully handle invalid input shares", async () => {
    const user1 = Wallet.random().address;

    await nexus.methods.addLiquidityETH(user1, many).send({ value: bn18("10") });
    const shares = bn((await nexus.methods.minters(user1).call()).liquidity);
    await nexus.methods.removeLiquidityETH(shares.muln(10), user1, many).send();

    expect(await balanceETH(deployer)).bignumber.closeTo(startDeployerBalanceETH, ether);
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  describe("rebalance usd/eth such that eth provider takes all IL risk but receives all excess eth", () => {
    it("handle correct per share allocation", async () => {
      const user1 = Wallet.random().address;
      const user2 = Wallet.random().address;

      await nexus.methods.addLiquidityETH(user1, many).send({ value: bn18("100") });
      const investedForUser1 = await totalInvestedUSDC();
      expect(investedForUser1).bignumber.closeTo(startPrice.muln(100), bn6("0.01"));

      await changeEthPrice(50);
      expect(await totalInvestedUSDC()).bignumber.eq(investedForUser1);

      for (let i = 0; i < 3; i++) {
        await nexus.methods.addLiquidityETH(user2, many).send({ value: bn18("100") });
        expect(await nexus.methods.removeAllLiquidityETH(user2, many).call()).bignumber.closeTo(
          bn18("100"),
          bn18("0.001")
        );
        await nexus.methods.removeAllLiquidityETH(user2, many).send();
      }

      expect(await totalInvestedUSDC()).bignumber.eq(investedForUser1);
    });

    it("same user enter and exit multiple times, no leftovers", async () => {
      const user = Wallet.random().address;
      await nexus.methods.addLiquidityETH(user, many).send({ value: bn18("100") });
      await changeEthPrice(50);
      await nexus.methods.addLiquidityETH(user, many).send({ value: bn18("100") });

      const ethInvested = startDeployerBalanceETH.sub(await balanceETH(deployer));
      expect(ethInvested).bignumber.closeTo(bn18("200"), bn18("0.01"));

      const shares0 = bn((await nexus.methods.minters(user).call()).liquidity);
      expect(await nexus.methods.removeLiquidityETH(shares0.divn(2), user, many).call()).bignumber.closeTo(
        bn18("98.3"),
        bn18("0.1")
      );
      await nexus.methods.removeLiquidityETH(shares0.divn(2), user, many).send();

      expect(await nexus.methods.removeAllLiquidityETH(user, many).call()).bignumber.closeTo(bn18("98.3"), bn18("0.1"));
      await nexus.methods.removeAllLiquidityETH(user, many).send();
      expect(await balanceETH(deployer)).bignumber.closeTo(startDeployerBalanceETH.sub(bn18("4")), bn18("1")); // from IL + gas

      const { entryETH, entryUSDC, liquidity } = await nexus.methods.minters(user).call();
      expect(liquidity).bignumber.zero;
      expect(entryETH).bignumber.zero;
      expect(entryUSDC).bignumber.zero;
      expect(await totalInvestedUSDC()).bignumber.zero;
    });

    it("whale -> price increase -> fish -> whale exit -> fish exit", async () => {
      const whale = Wallet.random().address;
      const fishy = Wallet.random().address;

      await nexus.methods.addLiquidityETH(whale, many).send({ value: bn18("100") });
      const usdBackingForWhale = startPrice.muln(100);
      expect(await totalInvestedUSDC()).bignumber.closeTo(usdBackingForWhale, bn6("0.01"));

      const price25 = await changeEthPrice(25);

      await nexus.methods.addLiquidityETH(fishy, many).send({ value: bn18("1") });
      const usdBackingForFish = price25; // new price of 1 eth
      expect(await totalInvestedUSDC()).bignumber.closeTo(usdBackingForWhale.add(usdBackingForFish), bn6("0.01"));

      // original eth after price shift without rebalancing is 89.44
      expect(await nexus.methods.removeAllLiquidityETH(whale, many).call()).bignumber.closeTo(
        bn18("98.89"),
        bn18("0.01")
      );
      await nexus.methods.removeAllLiquidityETH(whale, many).send();
      expect(await totalInvestedUSDC()).bignumber.closeTo(usdBackingForFish, bn6("0.01"));

      expect(await nexus.methods.removeAllLiquidityETH(fishy, many).call()).bignumber.closeTo(
        bn18("0.99"),
        bn18("0.01")
      );
      await nexus.methods.removeAllLiquidityETH(fishy, many).send();
      expect(await totalInvestedUSDC()).bignumber.zero;
      expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
    });

    it("multiple users while price shifts", async () => {
      const u1 = Wallet.random().address;
      const u2 = Wallet.random().address;

      await nexus.methods.addLiquidityETH(u1, many).send({ value: bn18("100") });
      await changeEthPrice(50);
      await nexus.methods.addLiquidityETH(u1, many).send({ value: bn18("100") });
      await changeEthPrice(-66.666);
      await nexus.methods.addLiquidityETH(u2, many).send({ value: bn18("100") });
      await changeEthPrice(300);
      await nexus.methods.addLiquidityETH(u2, many).send({ value: bn18("100") });

      expect(await nexus.methods.withdrawAll(u1).call()).bignumber.closeTo(bn18("190"), ether);
      expect(await nexus.methods.withdrawAll(u2).call()).bignumber.closeTo(bn18("175"), ether);
      await nexus.methods.withdrawAll(u1).send();
      await nexus.methods.withdrawAll(u2).send();
      expect(await totalInvestedUSDC()).bignumber.zero;
      expect(await balanceETH(deployer)).bignumber.closeTo(startDeployerBalanceETH.sub(bn18("35")), ether);
    });

    it("interest bearing lp tokens", async () => {
      const user1 = Wallet.random().address;
      const user2 = Wallet.random().address;

      await nexus.methods.addLiquidityETH(user1).send({ value: bn18("100") });
      await nexus.methods.addLiquidityETH(user2).send({ value: bn18("100") });

      await simulateInterestAccumulation();

      expect(await nexus.methods.withdrawAll(user1).call()).bignumber.closeTo(bn18("111"), ether);
      await nexus.methods.withdrawAll(user1).send();
      expect(await nexus.methods.withdrawAll(user2).call()).bignumber.closeTo(bn18("111"), ether);
      await nexus.methods.withdrawAll(user2).send();

      expect(await nexus.methods.totalInvestedUSD().call()).bignumber.zero;
      expect(await nexus.methods.totalInvestedETH().call()).bignumber.zero;
      expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
    });

    it("price increase + interest", async () => {
      const user1 = Wallet.random().address;
      const user2 = Wallet.random().address;

      await nexus.methods.addLiquidityETH(user1).send({ value: bn18("100") });
      await nexus.methods.addLiquidityETH(user2).send({ value: bn18("100") });

      await simulateInterestAccumulation();
      await changeEthPrice(50);

      expect(await nexus.methods.withdrawAll(user1).call()).bignumber.closeTo(bn18("104"), ether);
      await nexus.methods.withdrawAll(user1).send();
      expect(await nexus.methods.withdrawAll(user2).call()).bignumber.closeTo(bn18("104"), ether);
      await nexus.methods.withdrawAll(user2).send();

      expect(await nexus.methods.totalInvestedUSD().call()).bignumber.zero;
      expect(await nexus.methods.totalInvestedETH().call()).bignumber.zero;
      expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
    });

    it("extreme price drop", async () => {
      const user1 = Wallet.random().address;
      const user2 = Wallet.random().address;

      await nexus.methods.addLiquidityETH(user1).send({ value: bn18("100") });
      await nexus.methods.addLiquidityETH(user2).send({ value: bn18("100") });

      await changeEthPrice(-90);

      expect(await nexus.methods.withdrawAll(user1).call()).bignumber.closeTo(zero, ether);
      await nexus.methods.withdrawAll(user1).send();
      expect(await nexus.methods.withdrawAll(user2).call()).bignumber.closeTo(zero, ether);
      await nexus.methods.withdrawAll(user2).send();

      expect(await nexus.methods.totalInvestedUSD().call()).bignumber.zero;
      expect(await nexus.methods.totalInvestedETH().call()).bignumber.zero;
      expect(await balanceUSDC()).bignumber.closeTo(startNexusBalanceUSDC.muln(987).divn(1000), bn6("1000")); // loss
    });

    it("price drop + interest", async () => {
      const user1 = Wallet.random().address;
      const user2 = Wallet.random().address;

      await nexus.methods.addLiquidityETH(user1).send({ value: bn18("100") });
      await nexus.methods.addLiquidityETH(user2).send({ value: bn18("100") });

      await simulateInterestAccumulation();
      await changeEthPrice(-50);

      expect(await nexus.methods.withdrawAll(user1).call()).bignumber.closeTo(bn18("106"), ether);
      await nexus.methods.withdrawAll(user1).send();
      expect(await nexus.methods.withdrawAll(user2).call()).bignumber.closeTo(bn18("106"), ether);
      await nexus.methods.withdrawAll(user2).send();

      expect(await nexus.methods.totalInvestedUSD().call()).bignumber.zero;
      expect(await nexus.methods.totalInvestedETH().call()).bignumber.zero;
      expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
    });
  });

  describe("comoundProfits", async () => {});
});
