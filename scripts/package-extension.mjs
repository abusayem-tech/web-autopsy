#!/usr/bin/env node
/**
 * Build the Chrome extension and publish the zip into apps/web/public/extension
 * so the website can serve download + install.
 */
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync, statSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extDir = join(root, "apps/extension");
const pkg = JSON.parse(readFileSync(join(extDir, "package.json"), "utf8"));
const outZip = join(extDir, `.output/extension-${pkg.version}-chrome.zip`);
const publicDir = join(root, "apps/web/public/extension");
const publicZip = join(publicDir, "web-autopsy-chrome.zip");

execSync("pnpm --filter extension zip", { cwd: root, stdio: "inherit" });

mkdirSync(publicDir, { recursive: true });
copyFileSync(outZip, publicZip);

const bytes = statSync(publicZip).size;
const sha256 = createHash("sha256").update(readFileSync(publicZip)).digest("hex");

const meta = {
  name: "Web Autopsy",
  version: pkg.version,
  filename: "web-autopsy-chrome.zip",
  downloadPath: "/extension/web-autopsy-chrome.zip",
  bytes,
  sha256,
  updatedAt: new Date().toISOString(),
};

writeFileSync(join(publicDir, "latest.json"), `${JSON.stringify(meta, null, 2)}\n`);
console.log(`Published ${publicZip} (${bytes} bytes)`);
