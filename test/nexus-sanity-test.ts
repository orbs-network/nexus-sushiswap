import { expect } from "chai";
import {
  balanceETH,
  balanceUSDC,
  deployer,
  IWETHContract,
  nexus,
  startDeployerBalanceETH,
  startNexusBalanceUSDC,
  startPrice,
} from "./test-base";
import { Tokens } from "../src/token";
import { bn, bn18, ether, many, zero } from "../src/utils";

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

  it("gracefully handle invalid input shares", async () => {
    await nexus.methods.addLiquidityETH(many).send({ value: bn18("10") });
    const shares = bn((await nexus.methods.minters(deployer).call()).shares);
    await nexus.methods.removeLiquidityETH(shares.muln(10), many).send(); // just ignore any shares above allocated, due to (for example) transfers

    expect(await balanceETH(deployer)).bignumber.closeTo(startDeployerBalanceETH, ether);
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  it("available space to deposit", async () => {
    const expectedETH = startNexusBalanceUSDC.mul(ether).div(startPrice);
    const availableSpaceForETH = await nexus.methods.availableSpaceToDepositETH().call();
    expect(availableSpaceForETH).bignumber.closeTo(expectedETH, bn18("0.00001"));

    await IWETHContract.methods.deposit().send({ value: availableSpaceForETH });
    await Tokens.WETH().methods.approve(nexus.options.address, availableSpaceForETH).send();

    await nexus.methods.addLiquidity(availableSpaceForETH, many).send();

    expect(await balanceUSDC()).bignumber.closeTo(zero, "100"); // near zero
  });
});
