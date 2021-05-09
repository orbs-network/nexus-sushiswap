import { expect } from "chai";
import {
  balanceETH,
  balanceUSDC,
  balanceWETH,
  deadline,
  deployer,
  IWETHContract,
  nexus,
  startNexusBalanceUSDC,
  startPrice,
  sushiEthUsdPair,
  totalPairedUSDC,
} from "./test-base";
import { Tokens } from "../src/token";
import { bn18, ether, many, zero } from "../src/utils";
import _ from "lodash";
import { parseEvents } from "../src/network";
import { Wallet } from "../src/wallet";

describe("LiquidityNexus Sanity Tests", () => {
  it("empty state", async () => {
    expect(await nexus.methods.USDC().call()).eq(Tokens.USDC().options.address);
    expect(await nexus.methods.WETH().call()).eq(Tokens.WETH().options.address);
    expect(await nexus.methods.paused().call()).is.false;
    expect(await nexus.methods.owner().call()).eq(deployer);
    expect(await nexus.methods.totalLiquidity().call()).bignumber.zero;
    expect(await nexus.methods.totalSupply().call()).bignumber.zero;
    expect(await nexus.methods.totalPairedShares().call()).bignumber.zero;
    expect(await nexus.methods.governance().call()).eq(deployer);

    expect(await balanceETH()).bignumber.zero;
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
    expect(await totalPairedUSDC()).bignumber.zero;
  });

  it("available space to deposit", async () => {
    const expectedETH = startNexusBalanceUSDC.mul(ether).div(startPrice);
    const availableSpaceForETH = await nexus.methods.availableSpaceToDepositETH().call();
    expect(availableSpaceForETH).bignumber.closeTo(expectedETH, bn18("0.00001"));

    await IWETHContract.methods.deposit().send({ value: availableSpaceForETH });
    await Tokens.WETH().methods.approve(nexus.options.address, availableSpaceForETH).send();

    await nexus.methods.addLiquidity(deployer, availableSpaceForETH, deadline).send();

    expect(await balanceUSDC()).bignumber.closeTo(zero, "100"); // near zero
  });

  it("mint events", async () => {
    const depositTx = await nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("10") });
    parseEvents(sushiEthUsdPair.options.jsonInterface, sushiEthUsdPair.options.address, depositTx);

    const mintEvents = _.get(depositTx.events, "Mint");
    expect(mintEvents).length(2);
    const poolMintEvent = _.find(mintEvents, (e) => e.address == sushiEthUsdPair.options.address);
    expect(poolMintEvent.returnValues["amount1"]).bignumber.eq(bn18("10"));
    const nexusMintEvent = _.find(mintEvents, (e) => e.address == nexus.options.address);
    expect(nexusMintEvent.returnValues["beneficiary"]).eq(deployer);
  });

  it("burn events", async () => {
    await nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("10") });

    const tx = await nexus.methods.removeAllLiquidity(deployer, deadline).send();
    parseEvents(sushiEthUsdPair.options.jsonInterface, sushiEthUsdPair.options.address, tx);

    const burnEvents = _.get(tx.events, "Burn");
    expect(burnEvents).length(2);
  });

  it("pricePerFullShare", async () => {
    await IWETHContract.methods.deposit().send({ value: bn18("100") });
    await Tokens.WETH().methods.approve(nexus.options.address, many).send();

    expect(await nexus.methods.pricePerFullShare().call()).bignumber.zero;
    await nexus.methods.addLiquidity(deployer, bn18("10"), deadline).send();
    expect(await nexus.methods.pricePerFullShare().call()).bignumber.eq(ether);

    await nexus.methods.compoundProfits(bn18("10"), 0).send();
    expect(await nexus.methods.pricePerFullShare().call()).bignumber.closeTo(bn18("1.5"), bn18("0.1")); // 50% swapped for USDC

    await nexus.methods.removeAllLiquidity(deployer, deadline).send();
    expect(await nexus.methods.pricePerFullShare().call()).bignumber.zero;
  });

  it("add and remove liquidity WETH", async () => {
    const amount = bn18("1000");
    await IWETHContract.methods.deposit().send({ value: amount });
    await Tokens.WETH().methods.approve(nexus.options.address, many).send();
    await nexus.methods.addLiquidity(deployer, amount, deadline).send();
    await nexus.methods.removeAllLiquidity(deployer, deadline).send();
    expect(await balanceWETH(deployer))
      .bignumber.closeTo(amount, ether)
      .lt(amount);
  });

  it("user 100% share, deposit & withdraw", async () => {
    const user = await Wallet.fake(1);
    const startBalance = await user.getBalance();

    await nexus.methods.addLiquidityETH(user.address, deadline).send({ value: bn18("10"), from: user.address });
    expect(await user.getBalance()).bignumber.closeTo(startBalance.sub(bn18("10")), ether);

    let account = await nexus.methods.minters(user.address).call();
    expect(account.pairedETH).bignumber.closeTo(bn18("10"), bn18("0.1"));
    expect(account.pairedUSDC).bignumber.gt(zero);
    expect(await nexus.methods.totalSupply().call())
      .bignumber.eq(await nexus.methods.totalPairedShares().call())
      .bignumber.eq(await nexus.methods.totalLiquidity().call())
      .bignumber.eq(account.pairedShares);

    await nexus.methods.removeAllLiquidityETH(user.address, deadline).send({ from: user.address });
    expect(await user.getBalance()).bignumber.closeTo(startBalance, bn18("0.1"));

    expect(await nexus.methods.totalSupply().call())
      .eq(await nexus.methods.totalLiquidity().call())
      .eq(await nexus.methods.totalPairedShares().call()).bignumber.zero;

    account = await nexus.methods.minters(user.address).call();
    expect(account.pairedETH).bignumber.zero;
    expect(account.pairedUSDC).bignumber.zero;
    expect(account.pairedShares).bignumber.zero;
    expect(account.unpairedETH).bignumber.zero;
    expect(account.unpairedShares).bignumber.zero;

    expect(await balanceETH()).bignumber.zero;
    expect(await balanceWETH()).bignumber.zero;
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);

    expect(await nexus.methods.totalSupply().call()).bignumber.zero;
    expect(await nexus.methods.totalPairedShares().call()).bignumber.zero;
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
    await nexus.methods.removeAllLiquidityETH(user1, deadline).send({ from: user1 });
    await nexus.methods.removeAllLiquidityETH(user2, deadline).send({ from: user2 });
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
    expect(await balanceETH(user1)).bignumber.closeTo(bn18("1,000,000"), bn18("0.1"));
    expect(await balanceETH(user2)).bignumber.closeTo(bn18("1,000,000"), bn18("0.1"));
  });
});
