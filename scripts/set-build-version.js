#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHROME_VERSION_COMPONENT_MAX = 65535;

function setBuildVersion(runNumber, rootDirectory = path.resolve(__dirname, "..")) {
  if (!/^\d+$/.test(String(runNumber))) throw new Error("The workflow run number must be a positive integer.");
  const run = Number(runNumber);
  if (!Number.isSafeInteger(run) || run < 1 || run > CHROME_VERSION_COMPONENT_MAX) {
    throw new Error(`The workflow run number must be between 1 and ${CHROME_VERSION_COMPONENT_MAX}.`);
  }

  const packagePath = path.join(rootDirectory, "package.json");
  const manifestPath = path.join(rootDirectory, "manifest.json");
  const packageData = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!/^\d+\.\d+\.\d+$/.test(packageData.version)) {
    throw new Error("package.json must contain a three-component numeric base version.");
  }

  manifest.version = `${packageData.version}.${run}`;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest.version;
}

if (require.main === module) {
  const version = setBuildVersion(process.argv[2] ?? process.env.GITHUB_RUN_NUMBER);
  process.stdout.write(`Chrome extension build version: ${version}\n`);
}

module.exports = { setBuildVersion };
