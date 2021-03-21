import fs from "fs";
import path from "path";

export interface ConfigFile {
  coinmarketcapKey: string;
  infuraKey: string;
  alchemyKey: string;
  etherscanKey: string;
}
export function config(): ConfigFile {
  const p = process.env.npm_package_config_file || "";
  if (!fs.existsSync(p)) throw new Error(`must provide a config file in package.json`);
  return JSON.parse(fs.readFileSync(path.resolve(p), { encoding: "utf8" })) as ConfigFile;
}
