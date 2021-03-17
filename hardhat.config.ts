import { HardhatUserConfig } from "hardhat/types";
import "hardhat-typechain";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-web3";
import { task } from "hardhat/config";
import { bscChainId, bscRpcUrls, coinmarketcapKey, ethChainId, ethRpcUrls } from "./src/consts";
import { random } from "./src/utils";

task("start", "").setAction(async () => {});

const config: HardhatUserConfig = {
  solidity: {
    version: "0.7.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        url: random(ethRpcUrls),
      },
      blockGasLimit: 12e6,
    },
    bsc: {
      chainId: bscChainId,
      url: random(bscRpcUrls),
      timeout: 120_000,
      httpHeaders: {
        keepAlive: "true",
      },
    },
    eth: {
      chainId: ethChainId,
      url: random(ethRpcUrls),
      timeout: 120_000,
      httpHeaders: {
        keepAlive: "true",
      },
    },
  },
  typechain: {
    outDir: "typechain-hardhat",
    target: "web3-v1",
  },
  mocha: {
    timeout: 240_000,
  },
  gasReporter: {
    currency: "USD",
    coinmarketcap: coinmarketcapKey,
    showTimeSpent: true,
  },
};
export default config;
