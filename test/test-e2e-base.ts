import BN from "bn.js";
import { bn, bn6, ether, many } from "../src/utils";
import { IUniswapV2Pair } from "../typechain-hardhat/IUniswapV2Pair";
import { contract, deployContract } from "../src/extensions";
import { impersonate, web3 } from "../src/network";
import { Tokens } from "../src/impl/token";
import { IUniswapV2Router02 } from "../typechain-hardhat/IUniswapV2Router02";
import { Wallet } from "../src/impl/wallet";
import { NexusSushiSingleEthUSDC } from "../typechain-hardhat/NexusSushiSingleEthUSDC";

const usdcWhale = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8"; // binance7

before(async () => {
  await impersonate(usdcWhale);
});

export let deployer: string;
export let nexus: NexusSushiSingleEthUSDC;
export let startDeployerEthBalance: BN;
export let startNexusUsdBalance: BN;
export let startPrice: BN;

/**
 * test case state init
 */
beforeEach(async () => {
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
 * Dumps USDC into the pool from whale until eth price is at target usdc percent increase from current price
 *
 * @param percent number
 * @returns the new eth price in usd
 */
export async function increaseEthPrice(percent: number) {
  console.log("increasing ETH price by", percent, "percent");

  let price = await ethPrice();
  console.log("price before", price.toString(10));

  const targetPrice = price.muln((1 + percent / 100) * 1000).divn(1000);
  const usdAmountToSell = await computeUsdToSellForTargetPrice(targetPrice);
  await whaleUsdDump(usdAmountToSell);

  price = await ethPrice();
  console.log("price after", price.toString(10));
  return price;
}

/**
 * Takes USDC from whale ensuring minimum amount
 */
export async function ensureUsdBalance(address: string, amount: BN) {
  if ((await usdcBalance(address)).lt(amount)) {
    await Tokens.eth.USDC().methods.transfer(address, amount).send({ from: usdcWhale });
  }
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

async function computeUsdToSellForTargetPrice(targetPrice: BN) {
  const { reserve0, reserve1 } = await sushiEthUsdPair.methods.getReserves().call();
  const rUsd = bn(reserve0).divn(1e6).toNumber();
  const rEth = bn(reserve1).div(ether).toNumber();
  const nTargetPrice = targetPrice.divn(1e6).toNumber();
  const targetUsdReserve = Math.sqrt(nTargetPrice * rEth * rUsd);
  return bn((targetUsdReserve - rUsd) * 1e6);
}

async function whaleUsdDump(usdAmountToSell: BN) {
  await Tokens.eth.USDC().methods.approve(sushiRouter.options.address, many).send({ from: usdcWhale });
  await sushiRouter.methods
    .swapExactTokensForETH(usdAmountToSell, 0, [Tokens.eth.USDC().address, Tokens.eth.WETH().address], usdcWhale, many)
    .send({ from: usdcWhale });
}
