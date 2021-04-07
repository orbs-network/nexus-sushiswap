import {
  balanceETH,
  balanceUSDC,
  deadline,
  deployer,
  expectRevert,
  nexus,
  startDeployerBalanceETH,
  startNexusBalanceUSDC,
  sushiEthUsdPair,
  sushiRouter,
} from "./test-base";
import { Tokens } from "../src/token";
import { bn, bn18, ether, many, zero } from "../src/utils";
import { expect } from "chai";
import { Wallet } from "../src/wallet";

describe("LiquidityNexus Security Tests", () => {
  it("should revert on improper access", async () => {
    await expectRevert(() => nexus.methods.emergencyExit().send({ from: Wallet.random().address }));
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
    const shares = bn((await nexus.methods.minters(deployer).call()).shares);
    await nexus.methods.removeLiquidityETH(deployer, shares.muln(10), deadline).send(); // just ignore any shares above allocated, due to (for example) transfers

    expect(await balanceETH(deployer)).bignumber.closeTo(startDeployerBalanceETH, ether);
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  it("beneficiary != sender", async () => {
    const user = (await Wallet.fake(1)).address;

    await nexus.methods.addLiquidityETH(user, deadline).send({ value: bn18("100"), from: deployer });
    expect((await nexus.methods.minters(user).call()).shares).bignumber.gt(zero);
    expect(await nexus.methods.balanceOf(user).call()).bignumber.gt(zero);
    expect(await nexus.methods.balanceOf(deployer).call()).bignumber.zero;

    await expectRevert(() => nexus.methods.removeAllLiquidityETH(user, deadline).send()); // cant burn other's shares

    await nexus.methods.removeAllLiquidityETH(deployer, deadline).send({ from: user });

    expect(await balanceETH(deployer)).bignumber.closeTo(startDeployerBalanceETH, bn18("0.1"));
  });
});
