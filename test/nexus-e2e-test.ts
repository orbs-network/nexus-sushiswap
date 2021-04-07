import { expect } from "chai";
import { Wallet } from "../src/wallet";
import { Tokens } from "../src/token";
import { bn18, ether, many } from "../src/utils";
import {
  balanceETH,
  balanceUSDC,
  balanceWETH,
  deployer,
  IWETHContract,
  nexus,
  startNexusBalanceUSDC,
} from "./test-base";

describe("LiquidityNexus with Sushiswap single sided ETH/USDC e2e", () => {
  it("owner can emergency liquidate", async () => {
    expect(await balanceUSDC()).not.bignumber.zero;
    expect(await balanceUSDC(deployer)).bignumber.zero;

    await nexus.methods.emergencyExit().send();

    expect(await nexus.methods.paused().call()).to.be.false;
    expect(await balanceUSDC()).bignumber.zero;
    expect(await balanceUSDC(deployer)).not.bignumber.zero;
  });

  it("add and remove liquidity WETH", async () => {
    const amount = bn18("10");
    await IWETHContract.methods.deposit().send({ value: amount });
    await Tokens.WETH().methods.approve(nexus.options.address, many).send();
    await nexus.methods.addLiquidity(deployer, amount, many).send();
    await nexus.methods.removeAllLiquidity(deployer).send();
    expect(await balanceWETH(deployer)).bignumber.closeTo(amount, bn18("0.00000001")); // probably rounding issues in Sushi
  });

  it("user 100% share, deposit & withdraw", async () => {
    const user = await Wallet.fake(1);
    const startBalance = await user.getBalance();

    await nexus.methods.addLiquidityETH(user.address, many).send({ value: bn18("10"), from: user.address });
    expect(await user.getBalance()).bignumber.closeTo(startBalance.sub(bn18("10")), ether);

    let account = await nexus.methods.minters(user.address).call();
    expect(account.entryETH).bignumber.closeTo(bn18("10"), bn18("0.1"));
    expect(account.entryUSDC).not.bignumber.zero;
    expect(await nexus.methods.totalSupply().call())
      .bignumber.eq(await nexus.methods.totalLiquidity().call())
      .bignumber.eq(account.shares);

    await nexus.methods.removeAllLiquidityETH(user.address).send({ from: user.address });
    expect(await user.getBalance()).bignumber.closeTo(startBalance, bn18("0.1"));

    expect(await nexus.methods.totalSupply().call()).eq(await nexus.methods.totalLiquidity().call()).bignumber.zero;
    account = await nexus.methods.minters(user.address).call();
    expect(account.entryETH).bignumber.zero;
    expect(account.entryUSDC).bignumber.zero;
    expect(account.shares).bignumber.zero;

    expect(await balanceETH()).bignumber.zero;
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  it("multiple deposits", async () => {
    const user1 = (await Wallet.fake(1)).address;
    const user2 = (await Wallet.fake(2)).address;
    await nexus.methods.addLiquidityETH(user1, many).send({ value: bn18("10"), from: user1 });
    await nexus.methods.addLiquidityETH(user2, many).send({ value: bn18("20"), from: user2 });
    expect(await nexus.methods.removeAllLiquidityETH(user1).call({ from: user1 })).bignumber.closeTo(bn18("10"), ether);
    expect(await nexus.methods.removeAllLiquidityETH(user2).call({ from: user2 })).bignumber.closeTo(bn18("20"), ether);
    await Promise.all([
      nexus.methods.removeAllLiquidityETH(user1).send({ from: user1 }),
      nexus.methods.removeAllLiquidityETH(user2).send({ from: user2 }),
    ]);
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });
});
