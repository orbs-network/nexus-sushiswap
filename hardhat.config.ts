import { HardhatUserConfig } from "hardhat/types";
import "hardhat-typechain";
import "hardhat-gas-reporter";
import "hardhat-tracer";
import "hardhat-deploy";
import "@nomiclabs/hardhat-web3";
import "@nomiclabs/hardhat-etherscan";
import { task } from "hardhat/config";
import { configFile } from "./src/configFile";

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
        blockNumber: 12233644,
        url: "https://eth-mainnet.alchemyapi.io/v2/" + configFile().alchemyKey,
      },
      blockGasLimit: 12e6,
    },
    eth: {
      chainId: 1,
      url: "https://eth-mainnet.alchemyapi.io/v2/" + configFile().alchemyKey,
    },
  },
  typechain: {
    outDir: "typechain-hardhat",
    target: "web3-v1",
  },
  mocha: {
    timeout: 240_000,
    retries: 3,
    bail: true,
  },
  gasReporter: {
    currency: "USD",
    coinmarketcap: configFile().coinmarketcapKey,
    showTimeSpent: true,
  },
  etherscan: {
    apiKey: configFile().etherscanKey,
  },
};
export default config;
