const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.service_worker, "src/service-worker.js");
assert.deepEqual(new Set(manifest.permissions), new Set(["storage", "tabs", "webNavigation"]));
for (const entry of manifest.content_scripts) {
  assert.equal(entry.run_at, "document_start");
  assert.equal(entry.all_frames, true);
}
for (const file of ["src/counting.js", "src/icon.js", "src/peer-counting.js", "src/internals-counting.js", "src/main-world.js", "src/content-bridge.js", "src/service-worker.js", "popup.js", "demo.js"]) {
  new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });
}
assert.equal(manifest.icons, undefined);
assert.equal(manifest.action.default_icon, undefined);
assert(!fs.existsSync("icons"), "repository must not contain binary icon assets");
const workerSource = fs.readFileSync("src/service-worker.js", "utf8");
assert.match(workerSource, /chrome\.action\.setIcon/);
assert.match(workerSource, /The generated icon is optional/);
console.log("Manifest, JavaScript syntax, permissions and generated action icon are valid.");
