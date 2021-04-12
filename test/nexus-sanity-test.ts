import { expect } from "chai";
import {
  balanceETH,
  balanceUSDC,
  deadline,
  deployer,
  IWETHContract,
  nexus,
  startNexusBalanceUSDC,
  startPrice,
  sushiEthUsdPair,
} from "./test-base";
import { Tokens } from "../src/token";
import { bn18, ether, many, zero } from "../src/utils";
import _ from "lodash";
import { parseEvents } from "../src/network";

describe("LiquidityNexus Sanity Tests", () => {
  it("sanity", async () => {
    expect(await nexus.methods.USDC().call()).eq(Tokens.USDC().address);
    expect(await nexus.methods.WETH().call()).eq(Tokens.WETH().address);
    expect(await nexus.methods.paused().call()).is.false;
    expect(await nexus.methods.owner().call()).eq(deployer);
    expect(await nexus.methods.totalLiquidity().call()).bignumber.zero;
    expect(await nexus.methods.totalSupply().call()).bignumber.zero;
    expect(await nexus.methods.governance().call()).eq(deployer);

    expect(await balanceETH()).bignumber.zero;
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
    expect(await nexus.methods.pricePerFullShare().call()).bignumber.closeTo(bn18("1.5"), bn18("0.1")); // 50% swapped for USDC, so +50% of pool

    await nexus.methods.removeAllLiquidity(deployer, deadline).send();
    expect(await nexus.methods.pricePerFullShare().call()).bignumber.zero;
  });

  it("owner rewards rate in percentmil", async () => {
    const ownerRewardsPercentmil = 30_000; //30%

    await IWETHContract.methods.deposit().send({ value: bn18("100") });
    await Tokens.WETH().methods.approve(nexus.options.address, many).send();
    await nexus.methods.compoundProfits(bn18("100"), ownerRewardsPercentmil).send();

    // TODO
    // expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC.add(startPrice.mul(bn18("30"))));
  });
});
