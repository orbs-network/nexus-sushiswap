import {
  balanceETH,
  balanceUSDC,
  balanceWETH,
  changeEthPrice,
  deadline,
  deployer,
  expectRevert,
  nexus,
  quote,
  startDeployerBalanceETH,
  startNexusBalanceUSDC,
  sushiEthUsdPair,
  sushiRouter,
  totalPairedUSDC,
  usdcWhale,
} from "./test-base";
import { Tokens } from "../src/token";
import { bn, bn18, bn6, ether, fmt18, fmt6, many, zero } from "../src/utils";
import { expect } from "chai";
import { Wallet } from "../src/wallet";
import { web3 } from "../src/network";

describe("LiquidityNexus Security Tests", () => {
  it("should revert on improper access", async () => {
    await expectRevert(() => nexus.methods.emergencyExit([]).send({ from: Wallet.random().address }));
  });

  it("salvage only allowed tokens", async () => {
    await expectRevert(() => nexus.methods.salvage([Tokens.WETH().address]).send());
    await expectRevert(() => nexus.methods.salvage([Tokens.USDC().address]).send());
    await expectRevert(() => nexus.methods.salvage([Tokens.SUSHI().address]).send());
    await expectRevert(() => nexus.methods.salvage([sushiEthUsdPair.options.address]).send());

    await sushiRouter.methods
      .swapExactETHForTokens(0, [Tokens.WETH().address, Tokens.DAI().address], deployer, many)
      .send({ value: bn18("100") });
    const amount = await Tokens.DAI().methods.balanceOf(deployer).call();
    await Tokens.DAI().methods.transfer(nexus.options.address, amount).send();
    expect(await Tokens.DAI().methods.balanceOf(deployer).call()).bignumber.zero;

    await nexus.methods.salvage([Tokens.DAI().address]).send();

    expect(await Tokens.DAI().methods.balanceOf(deployer).call()).bignumber.eq(amount);
  });

  it("gracefully handle invalid input shares", async () => {
    await nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("10") });
    const shares = bn(await nexus.methods.balanceOf(deployer).call());
    await nexus.methods.removeLiquidityETH(deployer, shares.muln(10), deadline).send(); // just ignore any shares above allocated, due to (for example) transfers

    expect(await balanceETH(deployer)).bignumber.closeTo(startDeployerBalanceETH, ether);
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
  });

  it("beneficiary != sender", async () => {
    const user = (await Wallet.fake(1)).address;

    await nexus.methods.addLiquidityETH(user, deadline).send({ value: bn18("100"), from: deployer });
    expect((await nexus.methods.minters(user).call()).pairedShares).bignumber.gt(zero);
    expect(await nexus.methods.balanceOf(user).call()).bignumber.gt(zero);
    expect(await nexus.methods.balanceOf(deployer).call()).bignumber.zero;

    await expectRevert(() => nexus.methods.removeAllLiquidityETH(user, deadline).send()); // cant burn other's shares

    await nexus.methods.removeAllLiquidityETH(deployer, deadline).send({ from: user });

    expect(await balanceETH(deployer)).bignumber.closeTo(startDeployerBalanceETH, bn18("0.1"));
  });

  it("emergency exit only for supplied minters, withdraws free capital", async () => {
    const user1 = (await Wallet.fake(1)).address;
    const user2 = (await Wallet.fake(2)).address;
    await nexus.methods.addLiquidityETH(user1, deadline).send({ value: bn18("100") });
    await nexus.methods.addLiquidityETH(user2, deadline).send({ value: bn18("100") });
    const allPairedUSDC = await totalPairedUSDC();

    await nexus.methods.emergencyExit([user1]).send();

    expect(await totalPairedUSDC()).bignumber.closeTo(allPairedUSDC.divn(2), bn6("10"));
    expect(await balanceUSDC()).bignumber.zero;
    expect(await balanceETH()).bignumber.zero;

    // expect(await totalPairedUSDC()).bignumber.zero;
    // expect(await balanceUSDC()).bignumber.zero;
    // expect(await balanceETH()).bignumber.zero;
    // expect(await balanceWETH()).bignumber.closeTo(bn18("200"), bn18("0.1"));
  });

  it("owner can emergency liquidate", async () => {
    expect(await balanceUSDC()).bignumber.eq(startNexusBalanceUSDC);
    expect(await balanceUSDC(deployer)).bignumber.zero;

    await nexus.methods.emergencyExit([]).send();

    expect(await nexus.methods.paused().call()).to.be.false;
    expect(await balanceUSDC()).bignumber.zero;
    expect(await balanceUSDC(deployer)).bignumber.eq(startNexusBalanceUSDC);
  });

  it("flashloan exploit? with price increased by x2", async () => {
    const startBalance = await balanceETH(deployer);
    await changeEthPrice(100);
    await nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("100") });
    await changeEthPrice(-50);
    await nexus.methods.removeAllLiquidityETH(deployer, deadline).send();
    const endBalance = await balanceETH(deployer);
    expect(endBalance).bignumber.lt(startBalance);
  });

  it("flashloan exploit? with price decreased by x2", async () => {
    const startBalance = await balanceETH(deployer);
    await changeEthPrice(-90);
    await nexus.methods.addLiquidityETH(deployer, deadline).send({ value: bn18("9500") });
    await changeEthPrice(1000);
    await nexus.methods.removeAllLiquidityETH(deployer, deadline).send();
    const endBalance = await balanceETH(deployer);
    expect(endBalance).bignumber.lt(startBalance);
  });

  it("flashloan exploit on exit", async () => {
    await Tokens.USDC().methods.approve(sushiRouter.options.address, many).send({ from: usdcWhale });

    const startBalanceETH = await balanceETH(usdcWhale);
    const startBalanceUSDC = await balanceUSDC(usdcWhale);

    const available = bn(await nexus.methods.availableSpaceToDepositETH().call());
    console.log(fmt18(available));
    await nexus.methods.addLiquidityETH(usdcWhale, deadline).send({ value: available, from: usdcWhale });

    const loan = bn18("300,000");

    const totalLoan = available.add(loan);
    console.log(fmt18(totalLoan));

    const beforeSwapUSDC = await balanceUSDC(usdcWhale);
    await sushiRouter.methods
      .swapExactETHForTokens(0, [Tokens.WETH().address, Tokens.USDC().address], usdcWhale, deadline)
      .send({ value: loan, from: usdcWhale });
    const amountToReturn = (await balanceUSDC(usdcWhale)).sub(beforeSwapUSDC);

    await nexus.methods.removeAllLiquidityETH(usdcWhale, deadline).send({ from: usdcWhale });

    console.log(fmt6(amountToReturn));

    const beforeSwapETH = await balanceETH(usdcWhale);
    await sushiRouter.methods
      .swapExactTokensForETH(amountToReturn, 0, [Tokens.USDC().address, Tokens.WETH().address], usdcWhale, deadline)
      .send({ from: usdcWhale });

    const resultingETH = (await balanceETH(usdcWhale)).sub(beforeSwapETH);
    console.log(fmt18(resultingETH));

    const fee = totalLoan.muln(300).divn(100_000);
    console.log("fee", fmt18(fee));

    const profit = resultingETH.sub(totalLoan).sub(fee);
    console.log("profit", fmt18(profit));

    const diffUSDC = (await balanceUSDC(usdcWhale)).sub(startBalanceUSDC);
    console.log(fmt6(diffUSDC));
    const diffETH = (await balanceETH(usdcWhale)).sub(startBalanceETH);
    console.log(fmt18(diffETH));
  });

  it("flashloan exploit on entry", async () => {
    console.log("price", fmt6(await quote()));

    await Tokens.USDC().methods.approve(sushiRouter.options.address, many).send({ from: usdcWhale });

    const startBalanceETH = await balanceETH(usdcWhale);
    const startBalanceUSDC = await balanceUSDC(usdcWhale);

    console.log(fmt18(startBalanceETH));

    const loanUSDC = bn6("500,000,000");

    await sushiRouter.methods
      .swapExactTokensForETH(loanUSDC, 0, [Tokens.USDC().address, Tokens.WETH().address], usdcWhale, deadline)
      .send({ from: usdcWhale });
    console.log("price", fmt6(await quote()));
    const loanResultETH = (await balanceETH(usdcWhale)).sub(startBalanceETH);

    const available = bn(await nexus.methods.availableSpaceToDepositETH().call());
    console.log("available space ETH", fmt18(available)); // 365 ETH
    await nexus.methods.addLiquidityETH(usdcWhale, deadline).send({ value: available, from: usdcWhale });

    const beforeSwapUSDC = await balanceUSDC(usdcWhale);
    await sushiRouter.methods
      .swapExactETHForTokens(0, [Tokens.WETH().address, Tokens.USDC().address], usdcWhale, deadline)
      .send({ value: loanResultETH, from: usdcWhale });
    const afterSwapUSDC = await balanceUSDC(usdcWhale);
    console.log("swap back result USDC", fmt6(afterSwapUSDC.sub(beforeSwapUSDC))); // 504 M USDC
    console.log("price", fmt6(await quote()));
    console.log(fmt18(await balanceETH(usdcWhale)));
  });
});
