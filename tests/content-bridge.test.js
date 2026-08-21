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
  let runtimeListener;
  const context = { window, chrome: { runtime: { sendMessage, onMessage: { addListener(listener) { runtimeListener = listener; } } } } };
  vm.runInNewContext(bridgeSource, context, { filename: "src/content-bridge.js" });
  return { window, listeners, runtimeListener };
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
      version: 2,
      type: "COUNTS",
      counts: { peers: 1, connectionStates: { new: 0, connecting: 0, connected: 1, disconnected: 0, failed: 0 }, audio: { inbound: 0, outbound: 1, total: 1, inboundBitrate: 0, outboundBitrate: 0 }, video: { inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 }, screenShare: { inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 } }
    }
  });
  assert.deepEqual(messages.map(message => message.type), ["FRAME_READY", "FRAME_COUNTS"]);
});

test("unknown, missing and inconsistent connection states are rejected", () => {
  const messages = [];
  const { window, listeners } = runBridge(message => { messages.push(message); return Promise.resolve(); });
  const validMedia = { inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 };
  const postCounts = connectionStates => listeners.get("message")({
    source: window,
    data: {
      source: "webrtc-live-monitor",
      version: 2,
      type: "COUNTS",
      counts: { peers: 1, connectionStates, audio: validMedia, video: validMedia, screenShare: validMedia }
    }
  });

  postCounts({ new: 0, connecting: 0, connected: 0, disconnected: 0, failed: 0, unknown: 1 });
  postCounts({ new: 0, connecting: 0, connected: 2, disconnected: 0, failed: 0 });
  postCounts({ new: 0, connecting: 0, connected: 1, disconnected: 0 });

  assert.deepEqual(messages.map(message => message.type), ["FRAME_READY"]);
});

test("valid device inventories are forwarded and malformed entries are rejected", () => {
  const messages = [];
  const { window, listeners } = runBridge(message => { messages.push(message); return Promise.resolve(); });
  const postDevices = devices => listeners.get("message")({
    source: window,
    data: { source: "webrtc-live-monitor", version: 2, type: "DEVICES", devices }
  });

  postDevices({ available: [{ kind: "audioinput", label: "USB microphone" }], used: [{ kind: "videoinput", label: "USB camera" }], permissions: { camera: "granted", microphone: "prompt" } });
  postDevices({ available: [{ kind: "usb", label: "untrusted" }], used: [], permissions: { camera: "granted", microphone: "granted" } });

  assert.deepEqual(messages.map(message => message.type), ["FRAME_READY", "FRAME_DEVICES"]);
  assert.deepEqual(messages[1].devices.used, [{ kind: "videoinput", label: "USB camera" }]);
});

test("permission requests are passed into the page only for supported media kinds", () => {
  const posted = [];
  const { window, runtimeListener } = runBridge(() => Promise.resolve());
  window.postMessage = message => posted.push(message);
  runtimeListener({ namespace: "webrtc-live-monitor", type: "REQUEST_MEDIA_PERMISSION", kind: "camera" });
  runtimeListener({ namespace: "webrtc-live-monitor", type: "REQUEST_MEDIA_PERMISSION", kind: "screen" });
  assert.deepEqual(structuredClone(posted), [{ source: "webrtc-live-monitor-extension", type: "REQUEST_MEDIA_PERMISSION", kind: "camera" }]);
});
