const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const manifest = JSON.parse(
  fs.readFileSync("manifest.json", "utf8")
);

assert.equal(manifest.manifest_version, 3);
assert.equal(
  manifest.background.service_worker,
  "src/service-worker.js"
);

assert.equal(manifest.action.default_popup, "popup.html");
assert(fs.existsSync("popup.html"));
assert.equal(manifest.side_panel.default_path, "popup.html?view=side-panel");

assert.deepEqual(
  new Set(manifest.permissions),
  new Set(["sidePanel", "storage", "webNavigation"])
);

for (const entry of manifest.content_scripts) {
  assert.equal(entry.run_at, "document_start");
  assert.equal(entry.all_frames, true);
}

const javascriptFiles = [
  "src/counting.js",
  "src/rtp-stats.js",
  "src/main-world.js",
  "src/content-bridge.js",
  "src/service-worker.js",
  "scripts/set-build-version.js",
  "popup.js",
  "demo.js"
];

for (const file of javascriptFiles) {
  new vm.Script(
    fs.readFileSync(file, "utf8"),
    { filename: file }
  );
}

assert.equal(manifest.action.default_icon, undefined);
assert.ok(
  manifest.icons,
  "Im Manifest fehlt das icons-Objekt."
);

assert.ok(
  Object.prototype.hasOwnProperty.call(manifest.icons, "128"),
  'Im Manifest fehlt das Icon mit der Größe "128".'
);

const icon128 = manifest.icons["128"];

assert.equal(
  typeof icon128,
  "string",
  'Der Wert von manifest.icons["128"] muss ein Dateipfad sein.'
);

assert.ok(
  fs.existsSync(icon128),
  `Die Icon-Datei existiert nicht: ${icon128}`
);

/*
 * Prüfen, ob das im Manifest angegebene Icon von Git erfasst wird.
 */
const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip"
]);

const repositoryFiles = execFileSync(
  "git",
  ["ls-files"],
  { encoding: "utf8" }
)
  .trim()
  .split("\n")
  .filter(Boolean);

const repositoryBinaryFiles = repositoryFiles.filter(file =>
  binaryExtensions.has(path.extname(file).toLowerCase())
);

assert.deepEqual(repositoryBinaryFiles, []);

const workerSource = fs.readFileSync(
  "src/service-worker.js",
  "utf8"
);

assert.doesNotMatch(
  workerSource,
  /setIcon|OffscreenCanvas|icon\.js/
);

assert.match(
  workerSource,
  /^importScripts\("counting\.js"\);/m
);

const workflowSource = fs.readFileSync(
  ".github/workflows/build-extension.yml",
  "utf8"
);

assert.match(
  workflowSource,
  /github\.ref == 'refs\/heads\/main'/
);

assert.match(
  workflowSource,
  /gh release create "main-\$\{GITHUB_RUN_NUMBER\}"/
);

assert.match(
  workflowSource,
  /dist\/webrtc-live-monitor\.zip\n\s+dist\/webrtc-live-monitor\.zip\.sha256/
);

assert.match(
  workflowSource,
  /--target "\$\{GITHUB_SHA\}"/
);

console.log(
  "Manifest, popup and optional side panel, JavaScript syntax, permissions and assets are valid."
);
