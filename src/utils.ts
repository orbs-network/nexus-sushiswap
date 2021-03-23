import { onFakeNetwork } from "./network";
import _ from "lodash";
import Web3 from "web3";
import BN from "bn.js";

export const many = bn18("1,000,000,000,000,000,000,000,000,000,000,000"); //decillion ether
export const ether = bn18("1");
export const zero = bn("0");

export function bn(n: BN | string | number): BN {
  if (!n) return zero;
  return new BN(n, 10);
}

/**
 * assuming 18 decimals, uncommify
 */
export function bn18(n: string): BN {
  return bn(Web3.utils.toWei(n.split(",").join(""), "ether"));
}

/**
 * assuming 8 decimals, uncommify
 */
export function bn8(n: string): BN {
  return bn(Web3.utils.toWei(n.split(",").join(""), "shannon")).divn(10);
}

/**
 * assuming 6 decimals, uncommify
 */
export function bn6(e: string): BN {
  return bn(Web3.utils.toWei(e.split(",").join(""), "lovelace"));
}

export function max(a: BN, b: BN): BN {
  return a.gt(b) ? a : b;
}

export function min(a: BN, b: BN): BN {
  return a.gt(b) ? b : a;
}

export function sum(values: BN[]) {
  return values.reduce((sum: BN, it: BN) => sum.add(it), zero);
}

export function sort(a: BN, b: BN) {
  return a.lt(b) ? -1 : a.eq(b) ? 0 : 1;
}

export function random<T>(ts: T[]): T {
  return ts[_.random(0, ts.length - 1)];
}

const consoleFgYellow = "\x1b[33m";
const consoleFgGreen = "\x1b[32m";
const consoleResetColor = "\x1b[0m";

/**
 * format amount and commify, assuming 18 decimals
 */
export function fmt(amount: BN, color = true): string {
  const parsed = fmt18(amount);
  const parts = _.split(parsed, ".");
  const upper = _.chain(parts[0].split(""))
    .reverse()
    .chunk(3)
    .map((c) => c.reverse().join(""))
    .reverse()
    .join(",")
    .value();
  const lower = _.chain(parts[1]).padEnd(4, "0").truncate({ length: 4, omission: "" }).value();
  const s = upper + "." + lower;

  return color ? consoleFgYellow + s + consoleResetColor : s;
}

export function fmt18(amount: BN) {
  return Web3.utils.fromWei(amount, "ether");
}

export async function swizzleLog() {
  const isFake = onFakeNetwork();
  const origLog = console.log;
  const origTable = console.table;

  const swizzledLog = (...args: any[]) => {
    origLog(isFake ? "[SAFE]" : consoleFgGreen + "[$$$]" + consoleResetColor, new Date(), ...args);
  };
  console.log = swizzledLog;

  console.table = (...args: any[]) => {
    console.log = origLog;
    origTable(...args);
    console.log = swizzledLog;
  };
}
