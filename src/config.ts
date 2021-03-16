import fs from "fs";
import path from "path";

export function config() {
  const p = process.env.npm_package_config_file || "";
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(path.resolve(p), { encoding: "utf8" }));
}
