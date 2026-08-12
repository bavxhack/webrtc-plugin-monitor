const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { setBuildVersion } = require("../scripts/set-build-version.js");

function temporaryProject(version = "1.3.0") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "webrtc-monitor-version-"));
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ version }));
  fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({ manifest_version: 3, version }));
  return directory;
}

test("workflow run number becomes the fourth Chrome version component", t => {
  const directory = temporaryProject();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  assert.equal(setBuildVersion("42", directory), "1.3.0.42");
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8")).version, "1.3.0.42");
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8")).version, "1.3.0");
});

test("invalid base versions and run numbers are rejected", t => {
  const invalidBaseDirectory = temporaryProject("1.3.0-beta");
  const validDirectory = temporaryProject();
  t.after(() => {
    fs.rmSync(invalidBaseDirectory, { recursive: true, force: true });
    fs.rmSync(validDirectory, { recursive: true, force: true });
  });

  assert.throws(() => setBuildVersion("42", invalidBaseDirectory), /three-component/);
  assert.throws(() => setBuildVersion("0", validDirectory), /between 1 and 65535/);
  assert.throws(() => setBuildVersion("not-a-run", validDirectory), /positive integer/);
});
