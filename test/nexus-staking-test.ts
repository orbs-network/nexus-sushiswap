import { expect } from "chai";
import { Tokens } from "../src/token";
import { deployer, IWETHContract, nexus } from "./test-base";
import { bn18, ether, many, zero } from "../src/utils";
import { advanceTime } from "../src/network";
import { Wallet } from "../src/wallet";

describe("LiquidityNexus Auto-Staking Tests", () => {
  it("stake in addLiquidity, claim rewards, unstake in removeLiquidity", async () => {
    expect(await Tokens.SUSHI().methods.balanceOf(deployer).call()).bignumber.zero;
    await nexus.methods.addLiquidityETH(many).send({ value: ether });
    await advanceTime(60 * 60 * 24); // 1 day
    await nexus.methods.claimRewards().send();
    expect(await Tokens.SUSHI().methods.balanceOf(deployer).call()).bignumber.greaterThan(zero);
  });

  it("compoundProfits ", async () => {
    const user1 = (await Wallet.fake(1)).address;
    const user2 = (await Wallet.fake(2)).address;

    await nexus.methods.addLiquidityETH(many).send({ value: bn18("100"), from: user1 });

    const amount = bn18("100");
    await IWETHContract.methods.deposit().send({ value: amount });
    await Tokens.WETH().methods.approve(nexus.options.address, many).send();
    await nexus.methods.compoundProfits(amount).send();

    await nexus.methods.addLiquidityETH(many).send({ value: bn18("100"), from: user2 });

    expect(await nexus.methods.removeAllLiquidityETH().call({ from: user1 })).bignumber.closeTo(bn18("200"), ether);
    expect(await nexus.methods.removeAllLiquidityETH().call({ from: user2 })).bignumber.closeTo(bn18("100"), ether);
  });
});
