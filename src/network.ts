import { bscChainId, bscRpcUrls, ethChainId, etherscanKey, ethRpcUrls } from "./consts";
import _ from "lodash";
import fetch from "node-fetch";
import { Artifact } from "hardhat/types";

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

export async function block(timestampMillis?: number): Promise<number> {
  const current: number = await web3().eth.getBlockNumber();
  if (!timestampMillis) return current;
  if (onBinanceSmartChain()) {
    const diffMillis = Date.now() - timestampMillis;
    const diffBlocks = _.round(diffMillis / 1000 / 3);
    return current - diffBlocks;
  } else {
    return etherscanBlockForTimestamp(timestampMillis);
  }
}

async function etherscanBlockForTimestamp(timestampMillis: number) {
  const seconds = _.round(timestampMillis / 1000);
  const url = `https://api.etherscan.io/api?module=block&action=getblocknobytime&timestamp=${seconds}&closest=before&apikey=${etherscanKey}`;
  const response = await fetch(url);
  const json = await response.json();
  return parseInt(json.result);
}

export async function impersonate(address: string) {
  console.log("impersonating", address);
  await network().provider.send("hardhat_impersonateAccount", [address]);
}

export async function resetFakeNetworkFork(blockNumber?: number) {
  console.log("was block", await block());
  await network().provider.send("hardhat_reset", [
    {
      forking: {
        blockNumber,
        jsonRpcUrl: forkingUrl(),
      },
    },
  ]);
  console.log("now block", await block());
}

export function onFakeNetwork() {
  return network().config.chainId == hre().config.networks.hardhat.chainId;
}

export function onBinanceSmartChain() {
  return network().name == "bsc" || network().config.chainId == bscChainId || bscRpcUrls.includes(forkingUrl());
}

export function onEthereum() {
  return network().name == "eth" || network().config.chainId == ethChainId || ethRpcUrls.includes(forkingUrl());
}

function forkingUrl() {
  return _.get(network().config, "forking.url");
}
