import { config } from "./config";

export const ethChainId = 0x1;
export const bscChainId = 0x38;

export const infuraUrl = "https://mainnet.infura.io/v3/" + config().infuraKey;
export const alchemyUrl = "https://eth-mainnet.alchemyapi.io/v2/" + config().alchemyKey;
export const ethRpcUrls = [infuraUrl, alchemyUrl];

export const bscRpcUrls = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
  "https://bsc-dataseed4.binance.org",
  "https://bsc-dataseed5.binance.org",
];

export const etherscanKey = config().etherscanKey;
export const coinmarketcapKey = config().coinmarketcapKey;
