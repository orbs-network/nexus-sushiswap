import { deployer, expectRevert, nexus, sushiEthUsdPair, sushiRouter } from "./test-base";
import { Tokens } from "../src/token";
import { bn18, many } from "../src/utils";
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
});
