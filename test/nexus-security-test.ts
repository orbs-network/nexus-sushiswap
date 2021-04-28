import {
  balanceETH,
  balanceUSDC,
  balanceWETH,
  changePriceETHByPercent,
  deadline,
  deployer,
  expectRevert,
  nexus,
  quote,
  startDeployerBalanceETH,
  startNexusBalanceUSDC,
  sushiEthUsdPair,
  sushiRouter,
  totalPairedUSDC,
  usdcWhale,
} from "./test-base";
import { Tokens } from "../src/token";
import { bn, bn18, bn6, ether, fmt18, fmt6, many, zero } from "../src/utils";
import { expect } from "chai";
import { Wallet } from "../src/wallet";
import { web3 } from "../src/network";

describe("LiquidityNexus Security Tests", () => {
  it("should revert on improper access", async () => {
    await expectRevert(() => nexus.methods.emergencyExit([]).send({ from: Wallet.random().address }));
  });

  it("salvage only allowed tokens", async () => {
    await expectRevert(() => nexus.methods.salvage([Tokens.WETH().address]).send());
    await expectRevert(() => nexus.methods.salvage([Tokens.USDC().address]).send());
    await expectRevert(() => nexus.methods.salvage([Tokens.SUSHI().address]).send());
    await expectRevert(() => nexus.methods.salvage([sushiEthUsdPair.options.address]).send());

    await sushiRouter.methods
      .swapExactETHForTokens(0, [Tokens.WETH().address, Tokens.DAI().address], deployer, many)
      .send({ value: bn18("100") });
    const amount = await Tokens.DAI().methods.balanceOf(deployer).call();
    await Tokens.DAI().methods.transfer(nexus.options.address, amount).send();
    expect(await Tokens.DAI().methods.balanceOf(deployer).call()).bignumber.zero;

    await nexus.methods.salvage([Tokens.DAI().address]).send();

    expect(await Tokens.DAI().methods.balanceOf(deployer).call()).bignumber.eq(amount);
  });

  it("gracefully handle invalid input shares", async () => {
    await nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("10") });
    const shares = bn(await nexus.methods.balanceOf(deployer).call());
    await nexus.methods.removeLiquidityETH(deployer, shares.muln(10), deadline).send(); // just ignore any shares above allocated, due to (for example) transfers

    expect(await balanceETH(deployer)).bignumber.closeTo(startDeployerBalanceETH, ether);
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  it("beneficiary != sender", async () => {
    const user = (await Wallet.fake(1)).address;

    await nexus.methods.addLiquidityETH(user, deadline).send({ value: bn18("100"), from: deployer });
    expect((await nexus.methods.minters(user).call()).pairedShares).bignumber.gt(zero);
    expect(await nexus.methods.balanceOf(user).call()).bignumber.gt(zero);
    expect(await nexus.methods.balanceOf(deployer).call()).bignumber.zero;

    await expectRevert(() => nexus.methods.removeAllLiquidityETH(user, deadline).send()); // cant burn other's shares

    await nexus.methods.removeAllLiquidityETH(deployer, deadline).send({ from: user });

    expect(await balanceETH(deployer)).bignumber.closeTo(startDeployerBalanceETH, bn18("0.1"));
  });

  it("emergency exit only for supplied minters, withdraws free capital", async () => {
    const user1 = (await Wallet.fake(1)).address;
    const user2 = (await Wallet.fake(2)).address;
    await nexus.methods.addLiquidityETH(user1, deadline).send({ value: bn18("100") });
    await nexus.methods.addLiquidityETH(user2, deadline).send({ value: bn18("100") });
    const allPairedUSDC = await totalPairedUSDC();

    await nexus.methods.emergencyExit([user1]).send();

    expect(await totalPairedUSDC()).bignumber.closeTo(allPairedUSDC.divn(2), bn6("10"));
    expect(await balanceUSDC()).bignumber.zero;
    expect(await balanceETH()).bignumber.zero;
  });

  it("owner can emergency liquidate", async () => {
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
    expect(await balanceUSDC(deployer)).bignumber.zero;

    await nexus.methods.emergencyExit([]).send();

    expect(await nexus.methods.paused().call()).to.be.false;
    expect(await balanceUSDC()).bignumber.zero;
    expect(await balanceUSDC(deployer)).bignumber.eq(startNexusBalanceUSDC);
  });

  it("whale price exploit on entry - PriceGuard", async () => {
    await changePriceETHByPercent(100);
    await expectRevert(() => nexus.methods.addLiquidityETH(deployer, deadline).send({ value: ether }));
  });

  it("whale price exploit on exit - PriceGuard", async () => {
    await nexus.methods
      .addLiquidityETH(deployer, deadline)
      .send({ value: await nexus.methods.availableSpaceToDepositETH().call() });

    await changePriceETHByPercent(-95);
    await expectRevert(() => nexus.methods.removeAllLiquidityETH(deployer, deadline).send());

    expect(await nexus.methods.totalPairedUSDC().call()).bignumber.closeTo(startNexusBalanceUSDC, bn6("1")); // all USDC still invested
    expect(await balanceUSDC()).bignumber.closeTo(zero, bn6("1")); // all USDC still invested
  });

  it("price oracle configurable by owner", async () => {
    await changePriceETHByPercent(100);

    // enums in the contract:
    const oracles = {
      noOracle: "0",
      chainlinkOracle: "1",
      compoundOracle: "2",
    };

    expect(await nexus.methods.selectedOracle().call()).eq(oracles.chainlinkOracle); // the default is chainlink
    await expectRevert(() => nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("100") }));

    await nexus.methods.setPriceOracle(oracles.compoundOracle).send();
    expect(await nexus.methods.selectedOracle().call()).eq(oracles.compoundOracle);
    await expectRevert(() => nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("100") }));

    await nexus.methods.setPriceOracle(oracles.noOracle).send();
    expect(await nexus.methods.selectedOracle().call()).eq(oracles.noOracle);
    await nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("100") }); // will not revert
  });
});
