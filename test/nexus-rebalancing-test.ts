import { expect } from "chai";
import { Wallet } from "../src/wallet";
import {
  balanceETH,
  balanceUSDC,
  changePriceETHByPercent,
  deadline,
  deployer,
  nexus,
  quote,
  simulateInterestAccumulation,
  startDeployerBalanceETH,
  startNexusBalanceUSDC,
  startPrice,
  totalPairedUSDC,
  initializeAndDepositUSDC,
} from "./test-base";
import { bn, bn18, bn6, ether, zero } from "../src/utils";

describe("RebalancingStrategy1: rebalance usd/eth such that eth provider takes all IL risk but receives all excess eth", () => {
  beforeEach(async () => {
    await initializeAndDepositUSDC();
    await nexus.methods.pausePriceGuard(true).send(); // no oracle to allow simulating price changes
  });

  it("handle correct per share allocation", async () => {
    const user1 = (await Wallet.fake(1)).address;
    const user2 = (await Wallet.fake(2)).address;

    await nexus.methods.addLiquidityETH(user1, deadline).send({ value: bn18("100"), from: user1 });
    const investedForUser1 = await totalPairedUSDC();
    expect(investedForUser1).bignumber.closeTo(startPrice.muln(100), bn6("0.01"));

    await changePriceETHByPercent(50);
    expect(await totalPairedUSDC()).bignumber.eq(investedForUser1);

    for (let i = 0; i < 3; i++) {
      await nexus.methods.addLiquidityETH(user2, deadline).send({ value: bn18("100"), from: user2 });
      expect(await nexus.methods.removeAllLiquidityETH(user2, deadline).call({ from: user2 })).bignumber.closeTo(
        bn18("100"),
        bn18("0.001")
      );
      await nexus.methods.removeAllLiquidityETH(user2, deadline).send({ from: user2 });
    }

    expect(await totalPairedUSDC()).bignumber.eq(investedForUser1);
  });

  it("same user enter and exit multiple times, no leftovers", async () => {
    await nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("100") });
    await changePriceETHByPercent(50);
    await nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("100") });

    const ethInvested = startDeployerBalanceETH.sub(await balanceETH(deployer));
    expect(ethInvested).bignumber.closeTo(bn18("200"), bn18("0.01"));

    const nexusLpBalance = bn(await nexus.methods.balanceOf(deployer).call());
    expect(await nexus.methods.removeLiquidityETH(deployer, nexusLpBalance.divn(2), deadline).call()).bignumber.closeTo(
      bn18("98.3"),
      bn18("0.1")
    );
    await nexus.methods.removeLiquidityETH(deployer, nexusLpBalance.divn(2), deadline).send();

    await changePriceETHByPercent(50);

    expect(await nexus.methods.removeAllLiquidityETH(deployer, deadline).call()).bignumber.closeTo(
      bn18("92.7"),
      bn18("0.1")
    );
    await nexus.methods.removeAllLiquidityETH(deployer, deadline).send();
    expect(await balanceETH(deployer)).bignumber.closeTo(startDeployerBalanceETH.sub(bn18("9")), ether); // from IL + gas

    const { pairedETH, pairedUSDC, pairedShares, unpairedShares, unpairedETH } = await nexus.methods
      .minters(deployer)
      .call();
    expect(pairedShares).bignumber.zero;
    expect(pairedETH).bignumber.zero;
    expect(pairedUSDC).bignumber.zero;
    expect(unpairedETH).bignumber.zero;
    expect(unpairedShares).bignumber.zero;
    expect(await nexus.methods.totalSupply().call()).bignumber.zero;
    expect(await nexus.methods.totalPairedShares().call()).bignumber.zero;
    expect(await totalPairedUSDC()).bignumber.zero;
  });

  it("whale -> price increase -> fish -> whale exit -> fish exit", async () => {
    const whale = (await Wallet.fake(1)).address;
    const fishy = (await Wallet.fake(2)).address;

    await nexus.methods.addLiquidityETH(whale, deadline).send({ value: bn18("100"), from: whale });
    const usdBackingForWhale = startPrice.muln(100);
    expect(await totalPairedUSDC()).bignumber.closeTo(usdBackingForWhale, bn6("0.01"));

    await changePriceETHByPercent(25);
    const price25 = await quote();

    await nexus.methods.addLiquidityETH(fishy, deadline).send({ value: bn18("1"), from: fishy });
    const usdBackingForFish = price25; // new price of 1 eth
    expect(await totalPairedUSDC()).bignumber.closeTo(usdBackingForWhale.add(usdBackingForFish), bn6("0.01"));

    // original eth after price shift without rebalancing is 89.44
    expect(await nexus.methods.removeAllLiquidityETH(whale, deadline).call({ from: whale })).bignumber.closeTo(
      bn18("98.89"),
      bn18("0.01")
    );
    await nexus.methods.removeAllLiquidityETH(whale, deadline).send({ from: whale });
    expect(await totalPairedUSDC()).bignumber.closeTo(usdBackingForFish, bn6("0.01"));

    expect(await nexus.methods.removeAllLiquidityETH(fishy, deadline).call({ from: fishy })).bignumber.closeTo(
      bn18("0.99"),
      bn18("0.01")
    );
    await nexus.methods.removeAllLiquidityETH(fishy, deadline).send({ from: fishy });
    expect(await totalPairedUSDC()).bignumber.zero;
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  it("multiple users enter while price shifts", async () => {
    const u1 = (await Wallet.fake(1)).address;
    const u2 = (await Wallet.fake(2)).address;

    await nexus.methods.addLiquidityETH(u1, deadline).send({ value: bn18("100"), from: u1 });
    await changePriceETHByPercent(50);
    await nexus.methods.addLiquidityETH(u1, deadline).send({ value: bn18("100"), from: u1 });
    await changePriceETHByPercent(-66.666);
    await nexus.methods.addLiquidityETH(u2, deadline).send({ value: bn18("100"), from: u2 });
    await changePriceETHByPercent(300);
    await nexus.methods.addLiquidityETH(u2, deadline).send({ value: bn18("100"), from: u2 });

    expect(await nexus.methods.removeAllLiquidityETH(u1, deadline).call({ from: u1 })).bignumber.closeTo(
      bn18("190"),
      ether
    );
    expect(await nexus.methods.removeAllLiquidityETH(u2, deadline).call({ from: u2 })).bignumber.closeTo(
      bn18("175"),
      ether
    );
    await nexus.methods.removeAllLiquidityETH(u1, deadline).send({ from: u1 });
    await nexus.methods.removeAllLiquidityETH(u2, deadline).send({ from: u2 });
    expect(await totalPairedUSDC()).bignumber.zero;
    expect(await balanceETH(u1)).bignumber.closeTo(bn18("999,990"), ether);
    expect(await balanceETH(u2)).bignumber.closeTo(bn18("999,975"), ether);
  });

  it("interest bearing lp tokens", async () => {
    const user1 = (await Wallet.fake(1)).address;
    const user2 = (await Wallet.fake(2)).address;

    await nexus.methods.addLiquidityETH(user1, deadline).send({ value: bn18("100"), from: user1 });
    await nexus.methods.addLiquidityETH(user2, deadline).send({ value: bn18("100"), from: user2 });

    await simulateInterestAccumulation();

    expect(await nexus.methods.removeAllLiquidityETH(user1, deadline).call({ from: user1 })).bignumber.closeTo(
      bn18("111"),
      ether
    );
    await nexus.methods.removeAllLiquidityETH(user1, deadline).send({ from: user1 });
    expect(await nexus.methods.removeAllLiquidityETH(user2, deadline).call({ from: user2 })).bignumber.closeTo(
      bn18("111"),
      ether
    );
    await nexus.methods.removeAllLiquidityETH(user2, deadline).send({ from: user2 });

    expect(await nexus.methods.totalPairedUSDC().call()).bignumber.zero;
    expect(await nexus.methods.totalPairedETH().call()).bignumber.zero;
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  it("price increase + interest", async () => {
    const user1 = (await Wallet.fake(1)).address;
    const user2 = (await Wallet.fake(2)).address;

    await nexus.methods.addLiquidityETH(user1, deadline).send({ value: bn18("100"), from: user1 });
    await nexus.methods.addLiquidityETH(user2, deadline).send({ value: bn18("100"), from: user2 });

    await simulateInterestAccumulation();
    await changePriceETHByPercent(50);

    expect(await nexus.methods.removeAllLiquidityETH(user1, deadline).call({ from: user1 })).bignumber.closeTo(
      bn18("104"),
      ether
    );
    await nexus.methods.removeAllLiquidityETH(user1, deadline).send({ from: user1 });
    expect(await nexus.methods.removeAllLiquidityETH(user2, deadline).call({ from: user2 })).bignumber.closeTo(
      bn18("104"),
      ether
    );
    await nexus.methods.removeAllLiquidityETH(user2, deadline).send({ from: user2 });

    expect(await nexus.methods.totalPairedUSDC().call()).bignumber.zero;
    expect(await nexus.methods.totalPairedETH().call()).bignumber.zero;
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  it("extreme price drop", async () => {
    expect(await balanceUSDC())
      .bignumber.eq(bn6("10,000,000"))
      .eq(startNexusBalanceUSDC);

    await nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("100") });

    await changePriceETHByPercent(-90);

    expect(await nexus.methods.removeAllLiquidityETH(deployer, deadline).call()).bignumber.closeTo(zero, ether);
    await nexus.methods.removeAllLiquidityETH(deployer, deadline).send();

    expect(await nexus.methods.totalPairedUSDC().call()).bignumber.zero;
    expect(await nexus.methods.totalPairedETH().call()).bignumber.zero;
    expect(await balanceUSDC()).bignumber.lt(startNexusBalanceUSDC.sub(bn6("10,000"))); // loss of at least 10k
  });

  it("price drop + interest", async () => {
    await nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("100") });

    await simulateInterestAccumulation();
    await changePriceETHByPercent(-50);

    expect(await nexus.methods.removeAllLiquidityETH(deployer, deadline).call()).bignumber.gt(bn18("100"));
    await nexus.methods.removeAllLiquidityETH(deployer, deadline).send();

    expect(await nexus.methods.totalPairedUSDC().call()).bignumber.zero;
    expect(await nexus.methods.totalPairedETH().call()).bignumber.zero;
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });
});
