import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");
const versionTsPath = path.join(root, "src", "version.ts");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
  writeFileSync(
    versionTsPath,
    `export const ARGLEG_VERSION = ${JSON.stringify(pkg.version)};\nexport const ARGLEG_BUILD_DATE_TIME = ${JSON.stringify(new Date().toISOString())};\n`,
  );
  console.log(`ci:${pkg.version}`);
  process.exit(0);
}

// Local build: only bump when the working tree is clean (i.e. you're
// building to release/use). When iterating with uncommitted changes, leave
// version.ts untouched so the build doesn't dirty the tree on every run.
// `--untracked-files=no` ignores stray local files (e.g. browser dumps in
// data/) — only tracked-file modifications count as "dirty".
function isWorkingTreeDirty() {
  try {
    const out = execSync("git status --porcelain --untracked-files=no", {
      cwd: root,
      encoding: "utf8",
    });
    return out.trim().length > 0;
  } catch {
    // Not a git repo or git unavailable — preserve original behavior.
    return false;
  }
}

if (isWorkingTreeDirty()) {
  console.log(`skip:${pkg.version} (dirty tree)`);
  process.exit(0);
}

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
