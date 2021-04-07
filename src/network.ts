import _ from "lodash";
import { Artifact } from "hardhat/types";
import { TransactionReceipt } from "web3-core";

const parseReceiptEvents = require("web3-parse-receipt-events");

function hre() {
  return require("hardhat");
}

export function web3() {
  return hre().web3;
}

export function network() {
  return hre().network;
}

export function artifact(name: string): Artifact {
  return hre().artifacts.readArtifactSync(name);
}

export async function impersonate(address: string) {
  console.log("impersonating", address);
  await network().provider.send("hardhat_impersonateAccount", [address]);
}

export async function resetFakeNetworkFork(blockNumber: number = forkingBlockNumber()) {
  console.log("resetFakeNetworkFork");
  await network().provider.send("hardhat_reset", [
    {
      forking: {
        blockNumber,
        jsonRpcUrl: forkingUrl(),
      },
    },
  ]);
  console.log("block", await web3().eth.getBlockNumber());
}

export async function advanceTime(seconds: number) {
  const b = await web3().eth.getBlockNumber();
  console.log(`advancing time by ${seconds} seconds`);
  await network().provider.send("evm_increaseTime", [seconds]);
  await network().provider.send("evm_mine", [(await web3().eth.getBlock(b)).timestamp + seconds]);
}

export function parseEvents(abis: any[], address: string, tx: TransactionReceipt) {
  parseReceiptEvents(abis, address, tx);
}

function forkingBlockNumber() {
  return _.get(network().config, "forking.blockNumber");
}

function forkingUrl() {
  return _.get(network().config, "forking.url");
}
