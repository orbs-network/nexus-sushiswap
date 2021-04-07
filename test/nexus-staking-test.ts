import { expect } from "chai";
import { Tokens } from "../src/token";
import { deadline, deployer, IWETHContract, nexus } from "./test-base";
import { bn18, ether, many, zero } from "../src/utils";
import { advanceTime } from "../src/network";
import { Wallet } from "../src/wallet";

describe("LiquidityNexus Auto-Staking Tests", () => {
  it("stake in addLiquidity, claim rewards, unstake in removeLiquidity", async () => {
    expect(await Tokens.SUSHI().methods.balanceOf(deployer).call()).bignumber.zero;
    await nexus.methods.addLiquidityETH(deployer, deadline).send({ value: ether });
    await advanceTime(60 * 60 * 24); // 1 day
    await nexus.methods.claimRewards().send();
    expect(await Tokens.SUSHI().methods.balanceOf(deployer).call()).bignumber.greaterThan(zero);
  });

  it("compoundProfits ", async () => {
    const user1 = (await Wallet.fake(1)).address;
    const user2 = (await Wallet.fake(2)).address;

    await nexus.methods.addLiquidityETH(user1, deadline).send({ value: bn18("100"), from: user1 });

    const amount = bn18("100");
    await IWETHContract.methods.deposit().send({ value: amount });
    await Tokens.WETH().methods.approve(nexus.options.address, many).send();
    await nexus.methods.compoundProfits(amount).send();

    await nexus.methods.addLiquidityETH(user2, deadline).send({ value: bn18("100"), from: user2 });

    expect(await nexus.methods.removeAllLiquidityETH(user1, deadline).call({ from: user1 })).bignumber.closeTo(
      bn18("200"),
      ether
    );
    expect(await nexus.methods.removeAllLiquidityETH(user2, deadline).call({ from: user2 })).bignumber.closeTo(
      bn18("100"),
      ether
    );
  });
});
