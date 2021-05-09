import { HardhatUserConfig } from "hardhat/types";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "hardhat-tracer";
import "@nomiclabs/hardhat-web3";
import "@nomiclabs/hardhat-etherscan";
import { task } from "hardhat/config";
import { configFile } from "./src/configFile";
import { bn18 } from "./src/utils";
import { askAddress, deploy } from "./src/deploy";

task("deploy", "deploy target to mainnet").setAction(async () => {
  const name = "NexusLPSushi";
  const owner = await askAddress("owner address 0x");
  const gasLimit = 5_000_000;

  await deploy(name, [owner], gasLimit, 0, true);
});

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.4",
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
        blockNumber: 12399300,
        url: "https://eth-mainnet.alchemyapi.io/v2/" + configFile().alchemyKey,
      },
      blockGasLimit: 12e6,
      accounts: {
        accountsBalance: bn18("1,000,000").toString(),
      },
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
    retries: 1,
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
