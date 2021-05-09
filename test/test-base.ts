import BN from "bn.js";
import { NexusLPSushi } from "../typechain-hardhat/NexusLPSushi";
import { bn, bn18, bn6, ether, fmt18, fmt6, many } from "../src/utils";
import { IUniswapV2Pair } from "../typechain-hardhat/IUniswapV2Pair";
import { contract, deployContract } from "../src/extensions";
import { impersonate, resetNetworkFork, tag, web3 } from "../src/network";
import { Tokens } from "../src/token";
import { IUniswapV2Router02 } from "../typechain-hardhat/IUniswapV2Router02";
import { Wallet } from "../src/wallet";
import { IWETH } from "../typechain-hardhat/IWETH";
import { expect } from "chai";

export const usdcWhale = "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503";

export const deadline = many;
export let deployer: string;
export let nexus: NexusLPSushi;
export let startDeployerBalanceETH: BN;
export let startNexusBalanceUSDC: BN;
export let startPrice: BN;
export let sushiRouter: IUniswapV2Router02;
export let sushiEthUsdPair: IUniswapV2Pair;
export let IWETHContract: IWETH;

/**
 * test case state init
 */
beforeEach(async () => {
  while (true) {
    try {
      return await doBeforeEach();
    } catch (e) {
      console.error(e, "\ntrying again...");
    }
  }
});

async function initWallet() {
  const wallet = await Wallet.fake();
  wallet.setAsDefaultSigner();
  deployer = wallet.address;
  tag(deployer, "deployer");
}

async function doBeforeEach() {
  await resetNetworkFork();
  await impersonate(usdcWhale);
  tag(usdcWhale, "USDC whale");

  await initWallet();

  nexus = await deployContract<NexusLPSushi>("NexusLPSushi", { from: deployer });

  sushiRouter = contract<IUniswapV2Router02>(
    require("../artifacts/contracts/interface/ISushiswapRouter.sol/IUniswapV2Router02.json").abi,
    "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"
  );
  tag(sushiRouter.options.address, "sushiRouter");
  sushiEthUsdPair = contract<IUniswapV2Pair>(
    require("../artifacts/contracts/interface/ISushiswapRouter.sol/IUniswapV2Pair.json").abi,
    "0x397FF1542f962076d0BFE58eA045FfA2d347ACa0"
  );
  tag(sushiEthUsdPair.options.address, "sushiETH/USDCPair");
  IWETHContract = contract<IWETH>(
    require("../artifacts/contracts/interface/ISushiswapRouter.sol/IWETH.json").abi,
    Tokens.WETH().options.address
  );

  await supplyCapitalAsDeployer(bn6("10,000,000"));
  startNexusBalanceUSDC = await balanceUSDC();
  startDeployerBalanceETH = await balanceETH(deployer);
  startPrice = await quote();
}

/**
 * @returns eth price quote in usd, from nexus contract
 */
export async function quote() {
  return bn(await nexus.methods.quote(ether).call());
}

/**
 * @returns usdc balance, defaults to nexus address
 */
export async function balanceUSDC(address: string = nexus.options.address) {
  return bn(await Tokens.USDC().methods.balanceOf(address).call());
}

/**
 * @returns eth balance, defaults to nexus address
 */
export async function balanceETH(address: string = nexus.options.address) {
  return bn(await web3().eth.getBalance(address));
}

export async function balanceWETH(address: string = nexus.options.address) {
  return bn(await Tokens.WETH().methods.balanceOf(address).call());
}

export async function totalPairedUSDC() {
  return bn(await nexus.methods.totalPairedUSDC().call());
}

/**
 * Changes eth price in pool by dumping USDC or ETH from usdcWhale
 *
 * @param percent increase or decrease (- or +)
 * @returns the new eth price in usd
 */
export async function changePriceETHByPercent(percent: number) {
  console.log("changing ETH price by", percent, "%");

  const price = await quote();
  console.log("start price", fmt6(price));

  const startUSDC = await balanceUSDC(usdcWhale);
  const startETH = await balanceETH(usdcWhale);

  const targetPrice = price.muln((1 + percent / 100) * 1000).divn(1000);
  const usdDelta = await computeUsdDeltaForTargetPrice(targetPrice);

  if (targetPrice.gt(price)) {
    await Tokens.USDC().methods.approve(sushiRouter.options.address, many).send({ from: usdcWhale });
    await sushiRouter.methods
      .swapExactTokensForETH(
        usdDelta,
        0,
        [Tokens.USDC().options.address, Tokens.WETH().options.address],
        usdcWhale,
        many
      )
      .send({ from: usdcWhale });
  } else {
    await sushiRouter.methods
      .swapETHForExactTokens(
        usdDelta.muln(997).divn(1000),
        [Tokens.WETH().options.address, Tokens.USDC().options.address],
        usdcWhale,
        many
      )
      .send({ from: usdcWhale, value: (await balanceETH(usdcWhale)).sub(ether) });
  }
  console.log("end price", fmt6(await quote()));

  const endUSDC = await balanceUSDC(usdcWhale);
  const endETH = await balanceETH(usdcWhale);
  console.log("change by USDC", fmt6(endUSDC.sub(startUSDC)));
  console.log("change by ETH", fmt18(endETH.sub(startETH)));
}

export async function dumpPriceETH(amountETH: BN) {
  const beforeSwapUSDC = await balanceUSDC(usdcWhale);
  await sushiRouter.methods
    .swapExactETHForTokens(0, [Tokens.WETH().options.address, Tokens.USDC().options.address], usdcWhale, deadline)
    .send({ value: amountETH, from: usdcWhale });
  return (await balanceUSDC(usdcWhale)).sub(beforeSwapUSDC);
}

export async function pumpPriceETH(amountUSDC: BN) {
  const beforeSwapETH = await balanceETH(usdcWhale);
  await Tokens.USDC().methods.approve(sushiRouter.options.address, many).send({ from: usdcWhale });
  await sushiRouter.methods
    .swapExactTokensForETH(
      amountUSDC,
      0,
      [Tokens.USDC().options.address, Tokens.WETH().options.address],
      usdcWhale,
      deadline
    )
    .send({ from: usdcWhale });
  return (await balanceETH(usdcWhale)).sub(beforeSwapETH);
}

/**
 * Swap large amounts several times to accrue interest via swap fees, returning to the same(-ish) price
 */
export async function simulateInterestAccumulation() {
  for (let i = 0; i < 50; i++) {
    await changePriceETHByPercent(300);
    await changePriceETHByPercent(-75);
  }
}

async function supplyCapitalAsDeployer(amount: BN) {
  await web3().eth.sendTransaction({ from: (await Wallet.fake(9)).address, to: usdcWhale, value: bn18("500,000") });
  if ((await balanceUSDC(deployer)).lt(amount)) {
    await Tokens.USDC().methods.transfer(deployer, amount).send({ from: usdcWhale });
  }
  await Tokens.USDC().methods.approve(nexus.options.address, many).send({ from: deployer });
  await nexus.methods.depositAllCapital().send({ from: deployer });
}

async function computeUsdDeltaForTargetPrice(targetPrice: BN) {
  const { reserve0, reserve1 } = await sushiEthUsdPair.methods.getReserves().call();
  const rUsd = bn(reserve0).divn(1e6).toNumber();
  const rEth = bn(reserve1).div(ether).toNumber();
  const nTargetPrice = targetPrice.divn(1e6).toNumber();
  const targetUsdReserve = Math.sqrt(nTargetPrice * rEth * rUsd);
  return bn(Math.abs(targetUsdReserve - rUsd) * 1e6);
}

export async function expectRevert(fn: () => any) {
  let err: Error | null = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  expect(!!err, "expected to revert").true;
}
