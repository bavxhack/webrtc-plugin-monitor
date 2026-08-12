const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.service_worker, "src/service-worker.js");
assert.equal(manifest.action.default_popup, undefined);
assert(fs.existsSync("popup.html"));
assert.deepEqual(new Set(manifest.permissions), new Set(["storage", "tabs", "webNavigation"]));
for (const entry of manifest.content_scripts) {
  assert.equal(entry.run_at, "document_start");
  assert.equal(entry.all_frames, true);
}
for (const file of ["src/counting.js", "src/action-controller.js", "src/peer-counting.js", "src/rtp-stats.js", "src/main-world.js", "src/content-bridge.js", "src/service-worker.js", "popup.js", "demo.js"]) {
  new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });
}
assert.equal(manifest.icons, undefined);
assert.equal(manifest.action.default_icon, undefined);
const binaryExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip"]);
const repositoryFiles = require("node:child_process").execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n");
assert.deepEqual(repositoryFiles.filter(file => binaryExtensions.has(require("node:path").extname(file).toLowerCase())), []);
const workerSource = fs.readFileSync("src/service-worker.js", "utf8");
assert.doesNotMatch(workerSource, /setIcon|OffscreenCanvas|icon\.js/);
assert.match(workerSource, /WebRTCMonitorActionController\.install/);
console.log("Manifest, explicit toolbar click controller, JavaScript syntax, permissions and binary-free assets are valid.");
