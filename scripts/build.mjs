#!/usr/bin/env node
/**
 * Bundle extension into dist/chrome and/or dist/firefox.
 */
import * as esbuild from "esbuild";
import {
  cpSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2] || "all";
const targets =
  arg === "all" ? ["chrome", "firefox"] : arg === "chrome" || arg === "firefox" ? [arg] : null;

if (!targets) {
  console.error("Usage: node scripts/build.mjs [chrome|firefox|all]");
  process.exit(2);
}

async function bundle(entry, outfile, format = "esm") {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    outfile,
    format,
    platform: "browser",
    target: ["chrome120", "firefox121"],
    legalComments: "none",
    logLevel: "info",
  });
}

async function buildTarget(name) {
  const out = join(root, "dist", name);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  mkdirSync(join(out, "icons"), { recursive: true });

  const manifestSrc = join(root, "targets", name, "manifest.json");
  cpSync(manifestSrc, join(out, "manifest.json"));

  // SW + popup: ESM (manifest / script type=module)
  await bundle(
    join(root, "src/background/service-worker.js"),
    join(out, "background.js"),
    "esm",
  );
  // Content scripts: IIFE (no module type required)
  await bundle(
    join(root, "src/hosts/gmail/content.js"),
    join(out, "content.js"),
    "iife",
  );
  await bundle(join(root, "src/popup/popup.js"), join(out, "popup.js"), "esm");

  cpSync(join(root, "src/popup/popup.html"), join(out, "popup.html"));
  cpSync(join(root, "src/popup/popup.css"), join(out, "popup.css"));

  for (const size of [16, 48, 128]) {
    const icon = join(root, "assets/icons", `icon-${size}.png`);
    if (!existsSync(icon)) {
      throw new Error(`Missing icon ${icon} — run scripts/gen-icons.mjs`);
    }
    cpSync(icon, join(out, "icons", `icon-${size}.png`));
  }

  // popup.html references popup.js as module — ok for packaged files
  const html = readFileSync(join(out, "popup.html"), "utf8");
  writeFileSync(join(out, "popup.html"), html);

  console.log(`built dist/${name}`);
}

for (const t of targets) {
  await buildTarget(t);
}
