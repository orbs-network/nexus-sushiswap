import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";
import { configFile } from "../src/configFile";
import { web3 } from "../src/network";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deploy } = await hre.deployments;

  const account = web3().eth.accounts.privateKeyToAccount(configFile().pk);
  const deployer = account.address;

  console.log("deployer", deployer);
  console.log("deployer balance", await web3().eth.getBalance(deployer));
  console.log("deploying NexusLPSushi on network", await hre.getChainId());

  await deploy("NexusLPSushi", {
    from: account.privateKey,
    args: [],
    log: true,
    gasLimit: 5_000_000,
  });
};
export default func;
