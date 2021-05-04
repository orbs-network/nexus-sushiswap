import { artifact, tag, web3 } from "./network";
import { TransactionReceipt } from "web3-core";
import { CallOptions, Contract as ContractOrig, ContractOptions, SendOptions } from "web3-eth-contract";
import { BaseContract, BlockType } from "@typechain/web3-v1/static/types";

export type Contract = ContractOrig | BaseContract;
export type Options = CallOptions | SendOptions | ContractOptions;
export type PrimedOptions = CallOptions & SendOptions & ContractOptions;
export type BlockNumber = BlockType;
export type Receipt = TransactionReceipt;

export function contract<T extends Contract>(abi: string | any[], address: string = "", options?: Options) {
  const c = new (web3().eth.Contract)(abi, address, prime(options)) as T;
  c.handleRevert = true;
  return c;
}

export function prime(options?: Options, overrides?: Options): PrimedOptions {
  return { from: web3().eth.defaultAccount, ...options, ...overrides };
}

export async function deployContract<T extends Contract>(name: string, opts: PrimedOptions, constructorArgs?: any[]) {
  const _artifact = artifact(name);
  const deployed = await contract<T>(_artifact.abi)
    .deploy({ data: _artifact.bytecode, arguments: constructorArgs })
    .send(opts);
  console.log("deployed", name, deployed.options.address, "from", opts.from);
  tag(deployed.options.address, name);
  return contract<T>(_artifact.abi, deployed.options.address, deployed.options);
}
