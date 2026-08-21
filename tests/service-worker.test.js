const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const counting = require("../src/counting.js");

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test("startup removes stale state when its tab no longer exists", async () => {
  const storedState = { 34244944: { 0: { counts: counting.emptyCounts() } } };
  const writes = [];
  const errors = [];
  let onStartup;

  const chrome = {
    action: {
      onClicked: { addListener() {} },
      setBadgeBackgroundColor: async () => { throw new Error("No tab with id: 34244944."); },
      setBadgeText: async () => { assert.fail("badge text must not be set for a closed tab"); }
    },
    runtime: {
      getURL: path => `chrome-extension://test/${path}`,
      onMessage: { addListener() {} },
      onStartup: { addListener(listener) { onStartup = listener; } },
      sendMessage: async () => {}
    },
    storage: {
      session: {
        get: async () => ({ tabFrames: storedState }),
        set: async value => { writes.push(structuredClone(value)); }
      }
    },
    tabs: { onRemoved: { addListener() {} } },
    webNavigation: { onCommitted: { addListener() {} } },
    sidePanel: { setPanelBehavior: async () => {} }
  };

  const context = vm.createContext({
    chrome,
    console: { error: (...args) => errors.push(args) },
    Error,
    importScripts() {},
    Promise,
    structuredClone,
    URL,
    WebRTCMonitorActionController: { install: async () => {} },
    WebRTCMonitorCounting: counting
  });
  vm.runInContext(fs.readFileSync("src/service-worker.js", "utf8"), context, { filename: "src/service-worker.js" });

  onStartup();
  await nextTurn();
  await nextTurn();

  assert.deepEqual(errors, []);
  assert.deepEqual(writes.at(-1), { tabFrames: {} });
});
