import { expect } from "chai";
import { Tokens } from "../src/token";
import { balanceETH, deadline, deployer, IWETHContract, nexus, sushiRouter } from "./test-base";
import { bn, bn18, bn6, ether, many } from "../src/utils";
import { advanceTime, web3 } from "../src/network";
import { Wallet } from "../src/wallet";

describe("LiquidityNexus Auto-Staking Tests", () => {
  beforeEach(async () => {
    await Tokens.SUSHI().methods.approve(sushiRouter.options.address, many).send({ from: deployer });
    await Tokens.WETH().methods.approve(nexus.options.address, many).send({ from: deployer });
  });

  it.only("doHardWork", async () => {
    expect(await Tokens.SUSHI().methods.balanceOf(deployer).call()).bignumber.zero;
    expect(await Tokens.WETH().methods.balanceOf(deployer).call()).bignumber.zero;

    const nexusUSDCInitialBalance = bn(await Tokens.USDC().methods.balanceOf(nexus.options.address).call());
    const user = (await Wallet.fake(1)).address;
    const userEthInitialBalance = await balanceETH(user);
    const userEthInvestment = bn18("100");
    const hardWorkTimeInterval = 60 * 60 * 24; // 1 day

    await nexus.methods.addLiquidityETH(user, deadline).send({ value: userEthInvestment, from: user });

    await advanceTime(hardWorkTimeInterval);
    await doHardWork();

    expect(await nexus.methods.removeAllLiquidityETH(user, deadline).call({ from: user })).bignumber.closeTo(
      userEthInvestment,
      ether
    );
    await nexus.methods.removeAllLiquidityETH(user, deadline).send({ from: user });

    const nexusUSDCFinalBalance = bn(await Tokens.USDC().methods.balanceOf(nexus.options.address).call());
    const userEthFinalBalance = await balanceETH(user);
    const userEthGain = userEthFinalBalance.sub(userEthInitialBalance);

    expect(nexusUSDCFinalBalance).bignumber.closeTo(nexusUSDCInitialBalance, bn6("1"));
    console.log(
      "eth provider initial balance: ",
      userEthInitialBalance.toString(),
      " final balance: ",
      userEthFinalBalance.toString(),
      " eth gain: ",
      userEthGain.toString()
    );
    const dailyAPR = userEthGain.div(userEthInvestment);
    console.log(dailyAPR.toString());
    // const APR = dailyAPR * 365;
    // const APY = (dailyAPR + 1) ** 365;
    // console.log(" resulted APR: ", APR.toString(), " APY: ", APY.toString());
  });

  it("compoundProfits 2 users", async () => {
    const user1 = (await Wallet.fake(1)).address;
    const user2 = (await Wallet.fake(2)).address;

    await nexus.methods.addLiquidityETH(user1, deadline).send({ value: bn18("100"), from: user1 });

    const amount = bn18("100");
    await IWETHContract.methods.deposit().send({ value: amount });
    await Tokens.WETH().methods.approve(nexus.options.address, many).send({ from: deployer });
    await nexus.methods.compoundProfits(amount, 0).send({ from: deployer });

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
  await nexus.methods.claimRewards().send({ from: deployer });

  const sushiBalance = await Tokens.SUSHI().methods.balanceOf(deployer).call();
  console.log("doHardWork sushi", web3().utils.fromWei(sushiBalance, "ether"), "SUSHI");

  await sushiRouter.methods
    .swapExactTokensForTokens(sushiBalance, 0, [Tokens.SUSHI().address, Tokens.WETH().address], deployer, deadline)
    .send({ from: deployer });
  const rewards = await Tokens.WETH().methods.balanceOf(deployer).call();
  console.log("doHardWork rewards", web3().utils.fromWei(rewards, "ether"), "WETH");

  await nexus.methods.compoundProfits(rewards, 0).send({ from: deployer });
}
