import { HardhatUserConfig } from "hardhat/types";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "hardhat-tracer";
import "@nomiclabs/hardhat-web3";
import "@nomiclabs/hardhat-etherscan";
import { task } from "hardhat/config";
import { configFile } from "./src/configFile";
import { bn, bn18, ether, fmt18, fmt6, many } from "./src/utils";
import { deploy } from "./src/deploy";
import { newToken, Tokens } from "./src/token";
import {
  balanceETH,
  deadline,
  deployer,
  initializeAndDepositUSDC,
  nexus,
  sushiEthUsdPair,
  sushiRouter,
} from "./test/test-base";
import { Wallet } from "./src/wallet";
import { advanceTime, resetNetworkFork, web3 } from "./src/network";
import { contract } from "./src/extensions";
import { IMasterChef } from "./typechain-hardhat/IMasterChef";
import * as fs from "fs";
import _ from "lodash";

task("deploy", "deploy target to mainnet").setAction(async () => {
  const name = "NexusLPSushi";
  const gasLimit = 5_000_000;

  await deploy(name, [], gasLimit, 0, true);
});

task("rewardsAPY").setAction(async () => {
  const data = [];

  const startBlock = 12490200;
  const endBlock = 12496200;

  const day = 60 * 60 * 24;
  const moveBlocks = Math.round(day / 13 / 6);

  for (let i = startBlock; i < endBlock; i += moveBlocks) {
    await initializeAndDepositUSDC(i);

    await Tokens.SUSHI().methods.approve(sushiRouter.options.address, many).send({ from: deployer });
    await Tokens.WETH().methods.approve(nexus.options.address, many).send({ from: deployer });

    const masterChef = contract<IMasterChef>(
      require("./artifacts/contracts/interface/ISushiMasterChef.sol/IMasterChef.json").abi,
      "0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd"
    );
    const slp = newToken("SLP", "0x397FF1542f962076d0BFE58eA045FfA2d347ACa0");

    const user = (await Wallet.fake(1)).address;
    const initialBalanceETH = await balanceETH(user);
    console.log("initial balance", fmt18(initialBalanceETH));
    const principalETH = bn18("100");

    await nexus.methods.addLiquidityETH(user, deadline).send({ value: principalETH, from: user });

    const timeInterval = await advanceTime(day);

    // do hard work
    await nexus.methods.claimRewards().send({ from: deployer });

    const sushiBalance = await Tokens.SUSHI().methods.balanceOf(deployer).call();
    const info = await masterChef.methods.poolInfo(1).call();
    console.log("alloc points", info.allocPoint);
    console.log("total allocs", await masterChef.methods.totalAllocPoint().call());
    console.log("doHardWork sushi", fmt18(sushiBalance), "SUSHI");
    await sushiRouter.methods
      .swapExactTokensForTokens(
        sushiBalance,
        0,
        [Tokens.SUSHI().options.address, Tokens.WETH().options.address],
        deployer,
        deadline
      )
      .send({ from: deployer });
    const rewards = await Tokens.WETH().methods.balanceOf(deployer).call();
    console.log("doHardWork rewards", fmt18(rewards), "ETH");
    await nexus.methods.compoundProfits(rewards, 0).send({ from: deployer });

    await nexus.methods.removeAllLiquidityETH(user, deadline).send({ from: user });

    const endBalanceETH = await balanceETH(user);
    console.log("end balance", fmt18(endBalanceETH));

    const userProfitETH = endBalanceETH.sub(initialBalanceETH);

    const dailyRate = userProfitETH.mul(ether).div(principalETH);
    const APR = fmt18(dailyRate.muln(365).muln(100));
    const APY = (Math.pow(1 + parseFloat(fmt18(dailyRate)), 365) - 1) * 100;
    console.log("APR", APR, "%");
    console.log("APY (rewards only)", APY, "%");

    const r = await sushiEthUsdPair.methods.getReserves().call();
    const tvl = fmt6(bn(r.reserve0).muln(2));
    console.log("pair TVL:", tvl);

    const stakers = fmt18(await slp.methods.balanceOf(masterChef.options.address).call());
    console.log("stakers", stakers);

    const sushiPriceETH = fmt18(bn(rewards).mul(ether).div(bn(sushiBalance)));
    console.log("SUSHI price in ETH", sushiPriceETH);
    const ethPrice = fmt6(await nexus.methods.quote(ether).call());
    console.log("ETH price in USD", ethPrice);

    data.push({ ...timeInterval, tvl, stakers, sushiPriceETH, ethPrice, APR, APY });
  }

  const ss = data.map((x) => _.values(x).join(",")).join("\n");
  fs.writeFileSync("./apy.csv", ss, { encoding: "utf8" });
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
        blockNumber: 12496200,
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
