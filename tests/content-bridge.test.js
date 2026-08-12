const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const bridgeSource = fs.readFileSync("src/content-bridge.js", "utf8");

function runBridge(sendMessage) {
  const listeners = new Map();
  const window = {
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  const context = { window, chrome: { runtime: { sendMessage } } };
  vm.runInNewContext(bridgeSource, context, { filename: "src/content-bridge.js" });
  return { window, listeners };
}

test("a synchronously invalidated extension context does not escape", () => {
  assert.doesNotThrow(() => runBridge(() => { throw new Error("Extension context invalidated."); }));
});

test("a rejected runtime message does not become unhandled", async () => {
  runBridge(() => Promise.reject(new Error("Extension context invalidated.")));
  await new Promise(resolve => setImmediate(resolve));
});

test("valid page counts are forwarded after FRAME_READY", () => {
  const messages = [];
  const { window, listeners } = runBridge(message => { messages.push(message); return Promise.resolve(); });
  listeners.get("message")({
    source: window,
    data: {
      source: "webrtc-live-monitor",
      version: 1,
      type: "COUNTS",
      counts: { peers: 1, audio: { inbound: 0, outbound: 1, total: 1, inboundBitrate: 0, outboundBitrate: 0 }, video: { inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 } }
    }
  });
  assert.deepEqual(messages.map(message => message.type), ["FRAME_READY", "FRAME_COUNTS"]);
});
