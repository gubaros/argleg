import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");
const versionTsPath = path.join(root, "src", "version.ts");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const [major, minor, patch] = String(pkg.version ?? "0.1.0").split(".").map((x) => Number(x) || 0);
const next = `${major}.${minor}.${patch + 1}`;
const buildDateTime = new Date().toISOString();
pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
writeFileSync(
  versionTsPath,
  `export const ARGLEG_VERSION = ${JSON.stringify(next)};\nexport const ARGLEG_BUILD_DATE_TIME = ${JSON.stringify(buildDateTime)};\n`,
);
console.log(next);
