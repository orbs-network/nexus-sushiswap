import { expect } from "chai";
import { Tokens } from "../src/token";
import { deadline, deployer, IWETHContract, nexus, sushiRouter } from "./test-base";
import { bn, bn18, ether, many } from "../src/utils";
import { advanceTime, web3 } from "../src/network";
import { Wallet } from "../src/wallet";

describe("LiquidityNexus Auto-Staking Tests", () => {
  beforeEach(async () => {
    await Tokens.SUSHI().methods.approve(sushiRouter.options.address, many).send();
    await Tokens.WETH().methods.approve(nexus.options.address, many).send();
  });

  it.only("doHardWork", async () => {
    expect(await Tokens.SUSHI().methods.balanceOf(deployer).call()).bignumber.zero;
    expect(await Tokens.WETH().methods.balanceOf(deployer).call()).bignumber.zero;

    const user = (await Wallet.fake(1)).address;
    await nexus.methods.addLiquidityETH(user, deadline).send({ value: bn18("100"), from: user });

    await advanceTime(60 * 60 * 24); // 1 day
    await doHardWork();

    expect(await nexus.methods.removeAllLiquidityETH(user, deadline).call({ from: user })).bignumber.closeTo(
      bn18("100"),
      ether
    );

    console.log(bn(await Tokens.USDC().methods.balanceOf(nexus.options.address).call()).toNumber());
  });

  it("compoundProfits 2 users", async () => {
    const user1 = (await Wallet.fake(1)).address;
    const user2 = (await Wallet.fake(2)).address;

    await nexus.methods.addLiquidityETH(user1, deadline).send({ value: bn18("100"), from: user1 });

    const amount = bn18("100");
    await IWETHContract.methods.deposit().send({ value: amount });
    await Tokens.WETH().methods.approve(nexus.options.address, many).send();
    await nexus.methods.compoundProfits(amount, 0).send();

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

// This simulates Harvest Strategy doHardWork
async function doHardWork() {
  await nexus.methods.claimRewards().send();

  const sushiBalance = await Tokens.SUSHI().methods.balanceOf(deployer).call();
  console.log("doHardWork sushi", web3().utils.fromWei(sushiBalance, "ether"), "SUSHI");

  await sushiRouter.methods
    .swapExactTokensForTokens(sushiBalance, 0, [Tokens.SUSHI().address, Tokens.WETH().address], deployer, deadline)
    .send();
  const rewards = await Tokens.WETH().methods.balanceOf(deployer).call();
  console.log("doHardWork rewards", web3().utils.fromWei(rewards, "ether"), "WETH");

  await nexus.methods.compoundProfits(rewards, 0).send();
}
