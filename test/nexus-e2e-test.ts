import { expect } from "chai";
import { Wallet } from "../src/wallet";
import { Tokens } from "../src/token";
import { bn18, ether, many } from "../src/utils";
import {
  balanceETH,
  balanceUSDC,
  balanceWETH,
  deadline,
  deployer,
  IWETHContract,
  nexus,
  startNexusBalanceUSDC,
} from "./test-base";

describe("LiquidityNexus with Sushiswap single sided ETH/USDC e2e", () => {
  it("add and remove liquidity WETH", async () => {
    const amount = bn18("10");
    await IWETHContract.methods.deposit().send({ value: amount });
    await Tokens.WETH().methods.approve(nexus.options.address, many).send();
    await nexus.methods.addLiquidity(deployer, amount, deadline).send();
    await nexus.methods.removeAllLiquidity(deployer, deadline).send();
    expect(await balanceWETH(deployer)).bignumber.closeTo(amount, bn18("0.00000001")); // probably rounding issues in Sushi
  });

  it("user 100% share, deposit & withdraw", async () => {
    const user = await Wallet.fake(1);
    const startBalance = await user.getBalance();

    await nexus.methods.addLiquidityETH(user.address, deadline).send({ value: bn18("10"), from: user.address });
    expect(await user.getBalance()).bignumber.closeTo(startBalance.sub(bn18("10")), ether);

    let account = await nexus.methods.minters(user.address).call();
    expect(account.pairedETH).bignumber.closeTo(bn18("10"), bn18("0.1"));
    expect(account.pairedUSDC).not.bignumber.zero;
    expect(await nexus.methods.totalSupply().call())
      .bignumber.eq(await nexus.methods.totalLiquidity().call())
      .bignumber.eq(account.pairedShares);

    await nexus.methods.removeAllLiquidityETH(user.address, deadline).send({ from: user.address });
    expect(await user.getBalance()).bignumber.closeTo(startBalance, bn18("0.1"));

    expect(await nexus.methods.totalSupply().call()).eq(await nexus.methods.totalLiquidity().call()).bignumber.zero;
    account = await nexus.methods.minters(user.address).call();
    expect(account.pairedETH).bignumber.zero;
    expect(account.pairedUSDC).bignumber.zero;
    expect(account.pairedShares).bignumber.zero;

    expect(await balanceETH()).bignumber.zero;
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  it("multiple deposits", async () => {
    const user1 = (await Wallet.fake(1)).address;
    const user2 = (await Wallet.fake(2)).address;
    await nexus.methods.addLiquidityETH(user1, deadline).send({ value: bn18("10"), from: user1 });
    await nexus.methods.addLiquidityETH(user2, deadline).send({ value: bn18("20"), from: user2 });
    expect(await nexus.methods.removeAllLiquidityETH(user1, deadline).call({ from: user1 })).bignumber.closeTo(
      bn18("10"),
      ether
    );
    expect(await nexus.methods.removeAllLiquidityETH(user2, deadline).call({ from: user2 })).bignumber.closeTo(
      bn18("20"),
      ether
    );
    await Promise.all([
      nexus.methods.removeAllLiquidityETH(user1, deadline).send({ from: user1 }),
      nexus.methods.removeAllLiquidityETH(user2, deadline).send({ from: user2 }),
    ]);
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });
});
