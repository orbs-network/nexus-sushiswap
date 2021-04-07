import { expect } from "chai";
import { balanceETH, balanceUSDC, deployer, nexus, startDeployerBalanceETH, startNexusBalanceUSDC } from "./test-base";
import { Tokens } from "../src/token";
import { bn, bn18, ether, many } from "../src/utils";

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
});
