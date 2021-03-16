import fs from "fs";
import path from "path";

export function config() {
  const resolved = process.env.npm_package_config_file || "";
  if (!fs.existsSync(resolved)) return {};
  const configPath = path.resolve(resolved);
  return JSON.parse(fs.readFileSync(configPath, { encoding: "utf8" }));
}
