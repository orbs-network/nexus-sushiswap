import BN from "bn.js";
import { bn, bn18, bn6, ether, many } from "../src/utils";
import { IUniswapV2Pair } from "../typechain-hardhat/IUniswapV2Pair";
import { contract, deployContract } from "../src/extensions";
import { impersonate, resetFakeNetworkFork, web3 } from "../src/network";
import { Tokens } from "../src/impl/token";
import { IUniswapV2Router02 } from "../typechain-hardhat/IUniswapV2Router02";
import { Wallet } from "../src/impl/wallet";
import { NexusSushiSingleEthUSDC } from "../typechain-hardhat/NexusSushiSingleEthUSDC";

const usdcWhale = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8"; // binance7

export let deployer: string;
export let nexus: NexusSushiSingleEthUSDC;
export let startDeployerEthBalance: BN;
export let startNexusUsdBalance: BN;
export let startPrice: BN;

/**
 * test case state init
 */
beforeEach(async () => {
  await resetFakeNetworkFork();
  await impersonate(usdcWhale);
  const wallet = await Wallet.fake();
  wallet.setAsDefaultSigner();
  deployer = wallet.address;
  nexus = await deployContract<NexusSushiSingleEthUSDC>("NexusSushiSingleEthUSDC", deployer);

  await supplyCapitalAsDeployer(bn6("10,000,000"));
  [startDeployerEthBalance, startNexusUsdBalance, startPrice] = await Promise.all([
    ethBalance(deployer),
    usdcBalance(),
    ethPrice(),
  ]);
});

/**
 * @returns eth price quote in usd, from nexus contract
 */
export async function ethPrice() {
  return bn(await nexus.methods.ethToUsd(ether).call());
}

/**
 * @returns usdc balance, defaults to nexus address
 */
export async function usdcBalance(address: string = nexus.options.address) {
  return bn(await Tokens.eth.USDC().methods.balanceOf(address).call());
}

/**
 * @returns eth balance, defaults to nexus address
 */
export async function ethBalance(address: string = nexus.options.address) {
  return bn(await web3().eth.getBalance(address));
}

export async function totalInvestedUSD() {
  return bn(await nexus.methods.totalInvestedUSD().call());
}

/**
 * Changes eth price in pool by dumping USDC or ETH from a whale
 *
 * @param percent number (- or +)
 * @returns the new eth price in usd
 */
export async function changeEthPrice(percent: number) {
  console.log("changing ETH price by", percent, "percent");

  let price = await ethPrice();
  console.log("price before", price.toString(10));

  const targetPrice = price.muln((1 + percent / 100) * 1000).divn(1000);
  const usdDelta = await computeUsdDeltaForTargetPrice(targetPrice);

  if (targetPrice.gt(price)) {
    await Tokens.eth.USDC().methods.approve(sushiRouter.options.address, many).send({ from: usdcWhale });
    await sushiRouter.methods
      .swapExactTokensForETH(usdDelta, 0, [Tokens.eth.USDC().address, Tokens.eth.WETH().address], usdcWhale, many)
      .send({ from: usdcWhale });
  } else {
    await sushiRouter.methods
      .swapETHForExactTokens(usdDelta, [Tokens.eth.WETH().address, Tokens.eth.USDC().address], usdcWhale, many)
      .send({ from: usdcWhale, value: (await ethBalance(usdcWhale)).sub(bn18("1")) });
  }

  price = await ethPrice();
  console.log("price after", price.toString(10));
  return price;
}

export const sushiRouter = contract<IUniswapV2Router02>(
  require("../artifacts/contracts/ISushiswapRouter.sol/IUniswapV2Router02.json").abi,
  "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"
);

export const sushiEthUsdPair = contract<IUniswapV2Pair>(
  require("../artifacts/contracts/ISushiswapRouter.sol/IUniswapV2Pair.json").abi,
  "0x397FF1542f962076d0BFE58eA045FfA2d347ACa0"
);

async function supplyCapitalAsDeployer(amount: BN) {
  await ensureUsdBalance(deployer, amount);
  await Tokens.eth.USDC().methods.approve(nexus.options.address, many).send();
  await nexus.methods.depositAllCapital().send();
}

/**
 * Takes USDC from whale ensuring minimum amount
 */
async function ensureUsdBalance(address: string, amount: BN) {
  if ((await usdcBalance(address)).lt(amount)) {
    await Tokens.eth.USDC().methods.transfer(address, amount).send({ from: usdcWhale });
  }
}

async function computeUsdDeltaForTargetPrice(targetPrice: BN) {
  const { reserve0, reserve1 } = await sushiEthUsdPair.methods.getReserves().call();
  const rUsd = bn(reserve0).divn(1e6).toNumber();
  const rEth = bn(reserve1).div(ether).toNumber();
  const nTargetPrice = targetPrice.divn(1e6).toNumber();
  const targetUsdReserve = Math.sqrt(nTargetPrice * rEth * rUsd);
  return bn(Math.abs(targetUsdReserve - rUsd) * 1e6);
}
