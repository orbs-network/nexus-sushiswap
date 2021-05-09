import { expect } from "chai";
import { Tokens } from "../src/token";
import {
  balanceETH,
  balanceUSDC,
  deadline,
  deployer,
  initializeAndDepositUSDC,
  IWETHContract,
  nexus,
  startNexusBalanceUSDC,
  startPrice,
  sushiRouter,
} from "./test-base";
import { bn18, bn6, ether, fmt18, many } from "../src/utils";
import { advanceTime } from "../src/network";
import { Wallet } from "../src/wallet";
import BN from "bn.js";

describe("LiquidityNexus Auto-Staking Tests", () => {
  beforeEach(async () => {
    await initializeAndDepositUSDC();
  });

  it("doHardWork", async () => {
    await Tokens.SUSHI().methods.approve(sushiRouter.options.address, many).send({ from: deployer });
    expect(await Tokens.SUSHI().methods.balanceOf(deployer).call()).bignumber.zero;

    const user = (await Wallet.fake(1)).address;
    const initialBalanceETH = await balanceETH(user);
    const principalETH = bn18("100");
    const hardWorkTimeInterval = 60 * 60 * 24; // 1 day

    await nexus.methods.addLiquidityETH(user, deadline).send({ value: principalETH, from: user });

    await advanceTime(hardWorkTimeInterval);
    await doHardWork(0); //0% rewards to USDC provider

    expect(await nexus.methods.removeAllLiquidityETH(user, deadline).call({ from: user })).bignumber.closeTo(
      principalETH,
      ether
    );
    await nexus.methods.removeAllLiquidityETH(user, deadline).send({ from: user });

    const endBalanceETH = await balanceETH(user);
    const userProfitETH = endBalanceETH.sub(initialBalanceETH);

    expect(await balanceUSDC()).bignumber.closeTo(startNexusBalanceUSDC, bn6("1"));
    printAPY(principalETH, userProfitETH);
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

  it("owner rewards rate in percentmil", async () => {
    const ownerRewardsPercentmil = 30_000; //30%

    await IWETHContract.methods.deposit().send({ value: bn18("100") });
    await Tokens.WETH().methods.approve(nexus.options.address, many).send();
    await nexus.methods.compoundProfits(bn18("100"), ownerRewardsPercentmil).send();

    expect(await balanceUSDC()).bignumber.closeTo(startNexusBalanceUSDC.add(startPrice.muln(30)), bn6("1000"));
  });
});

async function doHardWork(capitalProviderRewardPercentmil: number) {
  await nexus.methods.claimRewards().send({ from: deployer });

  const sushiBalance = await Tokens.SUSHI().methods.balanceOf(deployer).call();
  console.log("doHardWork sushi", fmt18(sushiBalance), "SUSHI");

  await sushiRouter.methods
    .swapExactTokensForTokens(
      sushiBalance,
      0,
      [Tokens.SUSHI().options.address, Tokens.WETH().options.address],
      deployer,
      deadline
    )
    .send({ from: deployer });
  const rewards = await Tokens.WETH().methods.balanceOf(deployer).call();
  console.log("doHardWork rewards", fmt18(rewards), "WETH");

  await Tokens.WETH().methods.approve(nexus.options.address, many).send({ from: deployer });
  await nexus.methods.compoundProfits(rewards, capitalProviderRewardPercentmil).send({ from: deployer });
}

function printAPY(principalETH: BN, userProfitETH: BN) {
  console.log("=============");
  console.log("principal", fmt18(principalETH), "ETH profit", fmt18(userProfitETH));
  const dailyRate = userProfitETH.mul(ether).div(principalETH);
  const APR = dailyRate.muln(365);
  console.log("result APR: ", fmt18(APR.muln(100)), "%");
  const APY = Math.pow(1 + parseFloat(fmt18(dailyRate)), 365) - 1;
  console.log("result APY: ", APY * 100, "%");
  console.log("=============");
}
