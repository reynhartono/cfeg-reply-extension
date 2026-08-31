#!/usr/bin/env node
/**
 * Zip dist/chrome and dist/firefox for GitHub releases (no system `zip` required).
 */
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const ver = pkg.version;
const outDir = join(root, "release");

function mustBuild() {
  if (!existsSync(join(root, "dist/chrome/manifest.json"))) {
    console.error("Run npm run build:all first");
    process.exit(1);
  }
}

function listFiles(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listFiles(p, base, acc);
    else acc.push(relative(base, p));
  }
  return acc;
}

/** Create zip with paths relative to srcDir root via python3 zipfile. */
function zipDir(srcDir, outZip) {
  rmSync(outZip, { force: true });
  const files = listFiles(srcDir);
  if (!files.length) {
    console.error("empty", srcDir);
    process.exit(1);
  }
  const py = `
import zipfile, sys
src, out = sys.argv[1], sys.argv[2]
files = sys.argv[3:]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f"{src}/{f}", f)
print(out)
`;
  const r = spawnSync(
    "python3",
    ["-c", py, srcDir, outZip, ...files],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status || 1);
  }
  console.log("wrote", outZip);
}

mustBuild();
mkdirSync(outDir, { recursive: true });

const chromeZip = join(outDir, `cfeg-reply-extension-${ver}-chrome.zip`);
const firefoxZip = join(outDir, `cfeg-reply-extension-${ver}-firefox.zip`);
zipDir(join(root, "dist/chrome"), chromeZip);
zipDir(join(root, "dist/firefox"), firefoxZip);

console.log(JSON.stringify({ version: ver, chromeZip, firefoxZip }, null, 2));
