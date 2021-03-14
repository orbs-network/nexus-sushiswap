import fs from "fs";
import path from "path";

const configPath = path.resolve(process.env.npm_package_config_file!!);

export function config() {
  return JSON.parse(fs.readFileSync(configPath, { encoding: "utf8" }));
}
