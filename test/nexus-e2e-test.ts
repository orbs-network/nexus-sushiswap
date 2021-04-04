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
import { advanceTime } from "../src/network";

describe("LiquidityNexus with Sushiswap single sided ETH/USDC e2e", () => {
  describe("sanity", () => {
    it("sanity", async () => {
      expect(await nexus.methods.USDC().call()).eq(Tokens.eth.USDC().address);
      expect(await nexus.methods.WETH().call()).eq(Tokens.eth.WETH().address);
      expect(await nexus.methods.paused().call()).is.false;
      expect(await nexus.methods.owner().call()).eq(deployer);
      expect(await nexus.methods.totalLiquidity().call()).bignumber.zero;
      expect(await nexus.methods.totalSupply().call()).bignumber.zero;
      expect(await nexus.methods.governance().call()).eq(deployer);

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

    expect(await nexus.methods.paused().call()).to.be.false;
    expect(await balanceUSDC()).bignumber.zero;
    expect(await balanceUSDC(deployer)).not.bignumber.zero;
  });

  it("user 100% share, deposit & withdraw", async () => {
    const user = await Wallet.fake(1);
    const startBalance = await user.getBalance();

    await nexus.methods.addLiquidityETH(many).send({ value: bn18("10"), from: user.address });
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

  it("multiple deposits", async () => {
    const user1 = (await Wallet.fake(1)).address;
    const user2 = (await Wallet.fake(2)).address;
    await nexus.methods.addLiquidityETH(many).send({ value: bn18("10"), from: user1 });
    await nexus.methods.addLiquidityETH(many).send({ value: bn18("20"), from: user2 });
    expect(await nexus.methods.removeAllLiquidityETH().call({ from: user1 })).bignumber.closeTo(bn18("10"), ether);
    expect(await nexus.methods.removeAllLiquidityETH().call({ from: user2 })).bignumber.closeTo(bn18("20"), ether);
    await Promise.all([
      nexus.methods.removeAllLiquidityETH().send({ from: user1 }),
      nexus.methods.removeAllLiquidityETH().send({ from: user2 }),
    ]);
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  it("gracefully handle invalid input shares", async () => {
    await nexus.methods.addLiquidityETH(many).send({ value: bn18("10") });
    const shares = bn((await nexus.methods.minters(deployer).call()).liquidity);
    await nexus.methods.removeLiquidityETH(shares.muln(10), many).send();

    expect(await balanceETH(deployer)).bignumber.closeTo(startDeployerBalanceETH, ether);
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  describe("rebalance usd/eth such that eth provider takes all IL risk but receives all excess eth", () => {
    it("handle correct per share allocation", async () => {
      const user1 = (await Wallet.fake(1)).address;
      const user2 = (await Wallet.fake(2)).address;

      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100"), from: user1 });
      const investedForUser1 = await totalInvestedUSDC();
      expect(investedForUser1).bignumber.closeTo(startPrice.muln(100), bn6("0.01"));

      await changeEthPrice(50);
      expect(await totalInvestedUSDC()).bignumber.eq(investedForUser1);

      for (let i = 0; i < 3; i++) {
        await nexus.methods.addLiquidityETH(many).send({ value: bn18("100"), from: user2 });
        expect(await nexus.methods.removeAllLiquidityETH().call({ from: user2 })).bignumber.closeTo(
          bn18("100"),
          bn18("0.001")
        );
        await nexus.methods.removeAllLiquidityETH().send({ from: user2 });
      }

      expect(await totalInvestedUSDC()).bignumber.eq(investedForUser1);
    });

    it("same user enter and exit multiple times, no leftovers", async () => {
      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100") });
      await changeEthPrice(50);
      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100") });

      const ethInvested = startDeployerBalanceETH.sub(await balanceETH(deployer));
      expect(ethInvested).bignumber.closeTo(bn18("200"), bn18("0.01"));

      const shares0 = bn((await nexus.methods.minters(deployer).call()).liquidity);
      expect(await nexus.methods.removeLiquidityETH(shares0.divn(2), many).call()).bignumber.closeTo(
        bn18("98.3"),
        bn18("0.1")
      );
      await nexus.methods.removeLiquidityETH(shares0.divn(2), many).send();

      expect(await nexus.methods.removeAllLiquidityETH().call()).bignumber.closeTo(bn18("98.3"), bn18("0.1"));
      await nexus.methods.removeAllLiquidityETH().send();
      expect(await balanceETH(deployer)).bignumber.closeTo(startDeployerBalanceETH.sub(bn18("4")), bn18("1")); // from IL + gas

      const { entryETH, entryUSDC, liquidity } = await nexus.methods.minters(deployer).call();
      expect(liquidity).bignumber.zero;
      expect(entryETH).bignumber.zero;
      expect(entryUSDC).bignumber.zero;
      expect(await totalInvestedUSDC()).bignumber.zero;
    });

    it("whale -> price increase -> fish -> whale exit -> fish exit", async () => {
      const whale = (await Wallet.fake(1)).address;
      const fishy = (await Wallet.fake(2)).address;

      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100"), from: whale });
      const usdBackingForWhale = startPrice.muln(100);
      expect(await totalInvestedUSDC()).bignumber.closeTo(usdBackingForWhale, bn6("0.01"));

      const price25 = await changeEthPrice(25);

      await nexus.methods.addLiquidityETH(many).send({ value: bn18("1"), from: fishy });
      const usdBackingForFish = price25; // new price of 1 eth
      expect(await totalInvestedUSDC()).bignumber.closeTo(usdBackingForWhale.add(usdBackingForFish), bn6("0.01"));

      // original eth after price shift without rebalancing is 89.44
      expect(await nexus.methods.removeAllLiquidityETH().call({ from: whale })).bignumber.closeTo(
        bn18("98.89"),
        bn18("0.01")
      );
      await nexus.methods.removeAllLiquidityETH().send({ from: whale });
      expect(await totalInvestedUSDC()).bignumber.closeTo(usdBackingForFish, bn6("0.01"));

      expect(await nexus.methods.removeAllLiquidityETH().call({ from: fishy })).bignumber.closeTo(
        bn18("0.99"),
        bn18("0.01")
      );
      await nexus.methods.removeAllLiquidityETH().send({ from: fishy });
      expect(await totalInvestedUSDC()).bignumber.zero;
      expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
    });

    it("multiple users while price shifts", async () => {
      const u1 = (await Wallet.fake(1)).address;
      const u2 = (await Wallet.fake(2)).address;

      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100"), from: u1 });
      await changeEthPrice(50);
      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100"), from: u1 });
      await changeEthPrice(-66.666);
      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100"), from: u2 });
      await changeEthPrice(300);
      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100"), from: u2 });

      expect(await nexus.methods.removeAllLiquidityETH().call({ from: u1 })).bignumber.closeTo(bn18("190"), ether);
      expect(await nexus.methods.removeAllLiquidityETH().call({ from: u2 })).bignumber.closeTo(bn18("175"), ether);
      await nexus.methods.removeAllLiquidityETH().send({ from: u1 });
      await nexus.methods.removeAllLiquidityETH().send({ from: u2 });
      expect(await totalInvestedUSDC()).bignumber.zero;
      expect(await balanceETH(u1)).bignumber.closeTo(bn18("9,990"), ether);
      expect(await balanceETH(u2)).bignumber.closeTo(bn18("9,975"), ether);
    });

    it("interest bearing lp tokens", async () => {
      const user1 = (await Wallet.fake(1)).address;
      const user2 = (await Wallet.fake(2)).address;

      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100"), from: user1 });
      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100"), from: user2 });

      await simulateInterestAccumulation();

      expect(await nexus.methods.removeAllLiquidityETH().call({ from: user1 })).bignumber.closeTo(bn18("111"), ether);
      await nexus.methods.removeAllLiquidityETH().send({ from: user1 });
      expect(await nexus.methods.removeAllLiquidityETH().call({ from: user2 })).bignumber.closeTo(bn18("111"), ether);
      await nexus.methods.removeAllLiquidityETH().send({ from: user2 });

      expect(await nexus.methods.totalInvestedUSDC().call()).bignumber.zero;
      expect(await nexus.methods.totalInvestedETH().call()).bignumber.zero;
      expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
    });

    it("price increase + interest", async () => {
      const user1 = (await Wallet.fake(1)).address;
      const user2 = (await Wallet.fake(2)).address;

      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100"), from: user1 });
      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100"), from: user2 });

      await simulateInterestAccumulation();
      await changeEthPrice(50);

      expect(await nexus.methods.removeAllLiquidityETH().call({ from: user1 })).bignumber.closeTo(bn18("104"), ether);
      await nexus.methods.removeAllLiquidityETH().send({ from: user1 });
      expect(await nexus.methods.removeAllLiquidityETH().call({ from: user2 })).bignumber.closeTo(bn18("104"), ether);
      await nexus.methods.removeAllLiquidityETH().send({ from: user2 });

      expect(await nexus.methods.totalInvestedUSDC().call()).bignumber.zero;
      expect(await nexus.methods.totalInvestedETH().call()).bignumber.zero;
      expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
    });

    it("extreme price drop", async () => {
      expect(await balanceUSDC())
        .bignumber.eq(bn6("10,000,000"))
        .eq(startNexusBalanceUSDC);

      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100") });

      await changeEthPrice(-90);

      expect(await nexus.methods.removeAllLiquidityETH().call()).bignumber.closeTo(zero, ether);
      await nexus.methods.removeAllLiquidityETH().send();

      expect(await nexus.methods.totalInvestedUSDC().call()).bignumber.zero;
      expect(await nexus.methods.totalInvestedETH().call()).bignumber.zero;
      expect(await balanceUSDC()).bignumber.closeTo(bn6("9,934,000"), bn6("1,000")); // loss
    });

    it("price drop + interest", async () => {
      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100") });

      await simulateInterestAccumulation();
      await changeEthPrice(-50);

      expect(await nexus.methods.removeAllLiquidityETH().call()).bignumber.closeTo(bn18("106"), ether);
      await nexus.methods.removeAllLiquidityETH().send();

      expect(await nexus.methods.totalInvestedUSDC().call()).bignumber.zero;
      expect(await nexus.methods.totalInvestedETH().call()).bignumber.zero;
      expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
    });
  });

  describe("auto staking", () => {
    it("stake in addLiquidity, claim rewards in SUHI, unstake in removeLiquidity", async () => {
      expect(await nexus.methods.claimRewards().call()).bignumber.zero;
      await advanceTime(60 * 60 * 24); // 1 day
      expect(await nexus.methods.claimRewards().call()).bignumber.zero;

      await nexus.methods.addLiquidityETH(many).send({ value: bn18("100") });

      await advanceTime(60 * 60 * 24); // 1 day
      expect(await nexus.methods.claimRewards().call()).bignumber.greaterThan(zero);

      await nexus.methods.claimRewards().send();
      expect(await nexus.methods.claimRewards().call()).bignumber.zero;

      await nexus.methods.removeAllLiquidityETH().send();
      expect(await nexus.methods.claimRewards().call()).bignumber.zero;
    });
  });

  describe("comoundProfits", async () => {});
});
