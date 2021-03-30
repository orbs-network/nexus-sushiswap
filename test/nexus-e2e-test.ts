import { Wallet } from "../src/impl/wallet";
import { expect } from "chai";
import { Tokens } from "../src/impl/token";
import { bn, bn18, bn6, ether, zero } from "../src/utils";
import {
  deployer,
  ethBalance,
  changeEthPrice,
  nexus,
  startDeployerEthBalance,
  startNexusUsdBalance,
  startPrice,
  totalInvestedUSD,
  usdcBalance,
  simulateInterestAccumulation,
} from "./test-e2e-base";
import { expectRevert } from "./test-utils";

describe("LiquidityNexus with SushiSwap single sided ETH/USDC e2e", () => {
  describe("sanity", () => {
    it("sanity", async () => {
      expect(await nexus.methods.USDC().call()).eq(Tokens.eth.USDC().address);
      expect(await nexus.methods.WETH().call()).eq(Tokens.eth.WETH().address);
      expect(await nexus.methods.paused().call()).is.false;
      expect(await nexus.methods.governance().call())
        .eq(await nexus.methods.owner().call())
        .eq(deployer);
      expect(await nexus.methods.totalLiquidity().call()).bignumber.zero;
      expect(await nexus.methods.totalSupply().call()).bignumber.zero;

      expect(await ethBalance()).bignumber.zero;
    });

    it("should revert on improper access", async () => {
      await expectRevert(() =>
        nexus.methods.setGovernance(Wallet.random().address).send({ from: Wallet.random().address })
      );
    });
  });

  it("owner can emergencyLiquidate", async () => {
    expect(await usdcBalance()).not.bignumber.zero;
    expect(await usdcBalance(deployer)).bignumber.zero;

    await nexus.methods.emergencyLiquidate().send();

    expect(await nexus.methods.paused().call()).to.be.true;
    expect(await usdcBalance()).bignumber.zero;
    expect(await usdcBalance(deployer)).not.bignumber.zero;
  });

  it("user is governor, 100% share, deposit & withdraw", async () => {
    const user = await Wallet.fake(1);
    const startBalance = await user.getBalance();

    nexus.methods.setGovernance(user.address).send();

    await nexus.methods.deposit(user.address).send({ value: bn18("10"), from: user.address });
    expect(await user.getBalance()).bignumber.closeTo(startBalance.sub(bn18("10")), ether);

    let account = await nexus.methods.accounts(user.address).call();
    expect(account.eth).bignumber.closeTo(bn18("10"), bn18("0.1")); // difference due to gas costs
    expect(account.usd).not.bignumber.zero;
    expect(await nexus.methods.totalSupply().call())
      .bignumber.eq(await nexus.methods.totalLiquidity().call())
      .bignumber.eq(account.shares);

    await nexus.methods.withdrawAll(user.address).send({ from: user.address });
    expect(await user.getBalance()).bignumber.closeTo(startBalance, bn18("0.1"));

    expect(await nexus.methods.totalSupply().call()).eq(await nexus.methods.totalLiquidity().call()).bignumber.zero;
    account = await nexus.methods.accounts(user.address).call();
    expect(account.eth).bignumber.zero;
    expect(account.usd).bignumber.zero;
    expect(account.shares).bignumber.zero;

    expect(await ethBalance()).bignumber.zero;
    expect(await usdcBalance()).bignumber.eq(startNexusUsdBalance);
  });

  it("gov deposit for 2 accounts", async () => {
    const user1 = Wallet.random().address;
    const user2 = Wallet.random().address;
    await nexus.methods.deposit(user1).send({ value: bn18("10") });
    await nexus.methods.deposit(user2).send({ value: bn18("20") });
    expect(await nexus.methods.withdrawAll(user1).call()).bignumber.closeTo(bn18("10"), ether);
    expect(await nexus.methods.withdrawAll(user2).call()).bignumber.closeTo(bn18("20"), ether);
    await Promise.all([nexus.methods.withdrawAll(user1).send(), nexus.methods.withdrawAll(user2).send()]);
    expect(await usdcBalance()).bignumber.eq(startNexusUsdBalance);
  });

  it("gracefully handle invalid input shares", async () => {
    const user1 = Wallet.random().address;

    await nexus.methods.deposit(user1).send({ value: bn18("10") });
    const shares = bn((await nexus.methods.accounts(user1).call()).shares);
    await nexus.methods.withdraw(user1, shares.muln(10)).send();

    expect(await ethBalance(deployer)).bignumber.closeTo(startDeployerEthBalance, ether);
    expect(await usdcBalance()).bignumber.eq(startNexusUsdBalance);
  });

  describe("rebalance usd/eth such that eth provider takes all IL risk but receives all excess eth", () => {
    it("handle correct per share allocation", async () => {
      const user1 = Wallet.random().address;
      const user2 = Wallet.random().address;

      await nexus.methods.deposit(user1).send({ value: bn18("100") });
      const investedForUser1 = await totalInvestedUSD();
      expect(investedForUser1).bignumber.closeTo(startPrice.muln(100), bn6("0.01"));

      await changeEthPrice(50);
      expect(await totalInvestedUSD()).bignumber.eq(investedForUser1);

      for (let i = 0; i < 3; i++) {
        await nexus.methods.deposit(user2).send({ value: bn18("100") });
        expect(await nexus.methods.withdrawAll(user2).call()).bignumber.closeTo(bn18("100"), bn18("0.001"));
        await nexus.methods.withdrawAll(user2).send();
      }

      expect(await totalInvestedUSD()).bignumber.eq(investedForUser1);
    });

    it("same user enter and exit multiple times, no leftovers", async () => {
      const user = Wallet.random().address;
      await nexus.methods.deposit(user).send({ value: bn18("100") });
      await changeEthPrice(50);
      await nexus.methods.deposit(user).send({ value: bn18("100") });

      const ethInvested = startDeployerEthBalance.sub(await ethBalance(deployer));
      expect(ethInvested).bignumber.closeTo(bn18("200"), bn18("0.01"));

      const shares0 = bn((await nexus.methods.accounts(user).call()).shares);
      expect(await nexus.methods.withdraw(user, shares0.divn(2)).call()).bignumber.closeTo(bn18("98.3"), bn18("0.1"));
      await nexus.methods.withdraw(user, shares0.divn(2)).send();

      expect(await nexus.methods.withdrawAll(user).call()).bignumber.closeTo(bn18("98.3"), bn18("0.1"));
      await nexus.methods.withdrawAll(user).send();
      expect(await ethBalance(deployer)).bignumber.closeTo(startDeployerEthBalance.sub(bn18("4")), bn18("1")); // from IL + gas

      const { eth, usd, shares } = await nexus.methods.accounts(user).call();
      expect(shares).bignumber.zero;
      expect(eth).bignumber.zero;
      expect(usd).bignumber.zero;
      expect(await totalInvestedUSD()).bignumber.zero;
    });

    it("whale -> price increase -> fish -> whale exit -> fish exit", async () => {
      const whale = Wallet.random().address;
      const fishy = Wallet.random().address;

      await nexus.methods.deposit(whale).send({ value: bn18("100") });
      const usdBackingForWhale = startPrice.muln(100);
      expect(await totalInvestedUSD()).bignumber.closeTo(usdBackingForWhale, bn6("0.01"));

      const price25 = await changeEthPrice(25);

      await nexus.methods.deposit(fishy).send({ value: bn18("1") });
      const usdBackingForFish = price25; // new price of 1 eth
      expect(await totalInvestedUSD()).bignumber.closeTo(usdBackingForWhale.add(usdBackingForFish), bn6("0.01"));

      // original eth after price shift without rebalancing is 89.44
      expect(await nexus.methods.withdrawAll(whale).call()).bignumber.closeTo(bn18("98.89"), bn18("0.01"));
      await nexus.methods.withdrawAll(whale).send();
      expect(await totalInvestedUSD()).bignumber.closeTo(usdBackingForFish, bn6("0.01"));

      expect(await nexus.methods.withdrawAll(fishy).call()).bignumber.closeTo(bn18("0.99"), bn18("0.01"));
      await nexus.methods.withdrawAll(fishy).send();
      expect(await totalInvestedUSD()).bignumber.zero;
      expect(await usdcBalance()).bignumber.eq(startNexusUsdBalance);
    });

    it("multiple users while price shifts", async () => {
      const u1 = Wallet.random().address;
      const u2 = Wallet.random().address;

      await nexus.methods.deposit(u1).send({ value: bn18("100") });
      await changeEthPrice(50);
      await nexus.methods.deposit(u1).send({ value: bn18("100") });
      await changeEthPrice(-66.666);
      await nexus.methods.deposit(u2).send({ value: bn18("100") });
      await changeEthPrice(300);
      await nexus.methods.deposit(u2).send({ value: bn18("100") });

      expect(await nexus.methods.withdrawAll(u1).call()).bignumber.closeTo(bn18("190"), ether);
      expect(await nexus.methods.withdrawAll(u2).call()).bignumber.closeTo(bn18("175"), ether);
      await nexus.methods.withdrawAll(u1).send();
      await nexus.methods.withdrawAll(u2).send();
      expect(await totalInvestedUSD()).bignumber.zero;
      expect(await ethBalance(deployer)).bignumber.closeTo(startDeployerEthBalance.sub(bn18("35")), ether);
    });

    it("interest bearing lp tokens", async () => {
      const user1 = Wallet.random().address;
      const user2 = Wallet.random().address;

      await nexus.methods.deposit(user1).send({ value: bn18("100") });
      await nexus.methods.deposit(user2).send({ value: bn18("100") });

      await simulateInterestAccumulation();

      expect(await nexus.methods.withdrawAll(user1).call()).bignumber.closeTo(bn18("111"), ether);
      await nexus.methods.withdrawAll(user1).send();
      expect(await nexus.methods.withdrawAll(user2).call()).bignumber.closeTo(bn18("111"), ether);
      await nexus.methods.withdrawAll(user2).send();

      expect(await nexus.methods.totalInvestedUSD().call()).bignumber.zero;
      expect(await nexus.methods.totalInvestedETH().call()).bignumber.zero;
      expect(await usdcBalance()).bignumber.eq(startNexusUsdBalance);
    });

    it("price increase + interest", async () => {
      const user1 = Wallet.random().address;
      const user2 = Wallet.random().address;

      await nexus.methods.deposit(user1).send({ value: bn18("100") });
      await nexus.methods.deposit(user2).send({ value: bn18("100") });

      await simulateInterestAccumulation();
      await changeEthPrice(50);

      expect(await nexus.methods.withdrawAll(user1).call()).bignumber.closeTo(bn18("104"), ether);
      await nexus.methods.withdrawAll(user1).send();
      expect(await nexus.methods.withdrawAll(user2).call()).bignumber.closeTo(bn18("104"), ether);
      await nexus.methods.withdrawAll(user2).send();

      expect(await nexus.methods.totalInvestedUSD().call()).bignumber.zero;
      expect(await nexus.methods.totalInvestedETH().call()).bignumber.zero;
      expect(await usdcBalance()).bignumber.eq(startNexusUsdBalance);
    });

    it("extreme price drop", async () => {
      const user1 = Wallet.random().address;
      const user2 = Wallet.random().address;

      await nexus.methods.deposit(user1).send({ value: bn18("100") });
      await nexus.methods.deposit(user2).send({ value: bn18("100") });

      await changeEthPrice(-90);

      expect(await nexus.methods.withdrawAll(user1).call()).bignumber.closeTo(zero, ether);
      await nexus.methods.withdrawAll(user1).send();
      expect(await nexus.methods.withdrawAll(user2).call()).bignumber.closeTo(zero, ether);
      await nexus.methods.withdrawAll(user2).send();

      expect(await nexus.methods.totalInvestedUSD().call()).bignumber.zero;
      expect(await nexus.methods.totalInvestedETH().call()).bignumber.zero;
      expect(await usdcBalance()).bignumber.closeTo(startNexusUsdBalance.muln(987).divn(1000), bn6("1000")); // loss
    });

    it("price drop + interest", async () => {
      const user1 = Wallet.random().address;
      const user2 = Wallet.random().address;

      await nexus.methods.deposit(user1).send({ value: bn18("100") });
      await nexus.methods.deposit(user2).send({ value: bn18("100") });

      await simulateInterestAccumulation();
      await changeEthPrice(-50);

      expect(await nexus.methods.withdrawAll(user1).call()).bignumber.closeTo(bn18("106"), ether);
      await nexus.methods.withdrawAll(user1).send();
      expect(await nexus.methods.withdrawAll(user2).call()).bignumber.closeTo(bn18("106"), ether);
      await nexus.methods.withdrawAll(user2).send();

      expect(await nexus.methods.totalInvestedUSD().call()).bignumber.zero;
      expect(await nexus.methods.totalInvestedETH().call()).bignumber.zero;
      expect(await usdcBalance()).bignumber.eq(startNexusUsdBalance);
    });
  });

  describe("comoundProfits", async () => {});
});
