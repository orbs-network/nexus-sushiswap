import {
  balanceETH,
  balanceUSDC,
  changePriceETHByPercent,
  deadline,
  deployer,
  expectRevert,
  nexus,
  startDeployerBalanceETH,
  startNexusBalanceUSDC,
  sushiEthUsdPair,
  sushiRouter,
  totalPairedUSDC,
  initializeAndDepositUSDC,
} from "./test-base";
import { Tokens } from "../src/token";
import { bn, bn18, bn6, ether, many, zero } from "../src/utils";
import { expect } from "chai";
import { Wallet } from "../src/wallet";

describe("LiquidityNexus Security Tests", () => {
  beforeEach(async () => {
    await initializeAndDepositUSDC();
  });

  it("should revert on improper access", async () => {
    await expectRevert(() => nexus.methods.emergencyExit([]).send({ from: Wallet.random().address }));
  });

  it("salvage only allowed tokens", async () => {
    await expectRevert(() => nexus.methods.salvage([Tokens.WETH().options.address]).send());
    await expectRevert(() => nexus.methods.salvage([Tokens.USDC().options.address]).send());
    await expectRevert(() => nexus.methods.salvage([Tokens.SUSHI().options.address]).send());
    await expectRevert(() => nexus.methods.salvage([sushiEthUsdPair.options.address]).send());

    await sushiRouter.methods
      .swapExactETHForTokens(0, [Tokens.WETH().options.address, Tokens.DAI().options.address], deployer, many)
      .send({ value: bn18("100") });
    const amount = await Tokens.DAI().methods.balanceOf(deployer).call();
    await Tokens.DAI().methods.transfer(nexus.options.address, amount).send();
    expect(await Tokens.DAI().methods.balanceOf(deployer).call()).bignumber.zero;

    await nexus.methods.salvage([Tokens.DAI().options.address]).send();

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

  it("chainlink price oracle pausable by owner", async () => {
    await changePriceETHByPercent(100);

    expect(await nexus.methods.priceGuardPaused().call()).false; // chainlink turned on by default
    await expectRevert(() => nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("100") }));

    await nexus.methods.pausePriceGuard().send();
    expect(await nexus.methods.priceGuardPaused().call()).true;
    await nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("100") }); // will not revert

    await nexus.methods.unpausePriceGuard().send();
    expect(await nexus.methods.priceGuardPaused().call()).false;
  });

  describe("protection against price manipulations", () => {
    it("whale price exploit on entry - PriceGuard", async () => {
      await changePriceETHByPercent(100);
      await expectRevert(() => nexus.methods.addLiquidityETH(deployer, deadline).send({ value: ether }));
      await Tokens.WETH().methods.approve(nexus.options.address, many).send();
      await expectRevert(() => nexus.methods.addLiquidity(deployer, ether, deadline).send());
    });

    it("whale price exploit on exit - PriceGuard", async () => {
      await nexus.methods
        .addLiquidityETH(deployer, deadline)
        .send({ value: await nexus.methods.availableSpaceToDepositETH().call() });

      await changePriceETHByPercent(-95);

      await expectRevert(() => nexus.methods.removeAllLiquidityETH(deployer, deadline).send());
      await expectRevert(() => nexus.methods.removeAllLiquidity(deployer, deadline).send());
      await expectRevert(() => nexus.methods.removeLiquidityETH(deployer, "100", deadline).send());
      await expectRevert(() => nexus.methods.removeLiquidity(deployer, "100", deadline).send());

      expect(await nexus.methods.totalPairedUSDC().call()).bignumber.closeTo(startNexusBalanceUSDC, bn6("1")); // all USDC still invested
      expect(await balanceUSDC()).bignumber.closeTo(zero, bn6("1")); // all USDC still invested
    });
  });
});
