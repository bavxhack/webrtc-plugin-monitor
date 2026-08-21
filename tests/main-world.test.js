const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync("src/main-world.js", "utf8");
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test("connection-state changes update promptly without overlapping getStats measurements", async () => {
  const listeners = new Map();
  const measurements = [];
  const messages = [];

  class RTCPeerConnection {
    constructor() { this.connectionState = "new"; }
    addEventListener(type, listener) { listeners.set(type, listener); }
    getStats() {}
  }

  const window = {
    RTCPeerConnection,
    navigator: {},
    addEventListener() {},
    postMessage(message) { messages.push(message); }
  };
  const stats = {
    countPeerConnections() {
      return new Promise(resolve => measurements.push(resolve));
    }
  };
  vm.runInNewContext(source, {
    Promise,
    Reflect,
    Set,
    WeakMap,
    WeakSet,
    WebRTCMonitorRtpStats: stats,
    queueMicrotask,
    setInterval() {},
    window
  }, { filename: "src/main-world.js" });

  const pc = new window.RTCPeerConnection();
  await nextTurn();
  assert.equal(measurements.length, 1);

  pc.connectionState = "connecting";
  listeners.get("connectionstatechange")();
  pc.connectionState = "failed";
  listeners.get("connectionstatechange")();
  await nextTurn();
  assert.equal(measurements.length, 1);

  measurements.shift()({ peers: 1 });
  await nextTurn();
  assert.equal(measurements.length, 1);
  measurements.shift()({ peers: 1 });
  await nextTurn();

  assert.equal(messages.length, 2);
  assert(messages.every(message => message.version === 2 && message.type === "COUNTS"));
});

test("reports available devices and tracks used through getUserMedia", async () => {
  const messages = [];
  const trackListeners = new Map();
  const track = {
    kind: "audio",
    label: "USB microphone",
    readyState: "live",
    addEventListener(type, listener) { trackListeners.set(type, listener); }
  };
  const mediaDevices = {
    addEventListener() {},
    async enumerateDevices() { return [{ kind: "audioinput", label: "USB microphone" }]; },
    async getUserMedia() { return { getTracks: () => [track] }; }
  };
  const window = {
    navigator: { mediaDevices },
    addEventListener() {},
    postMessage(message) { messages.push(message); }
  };

  vm.runInNewContext(source, {
    Promise,
    Reflect,
    Set,
    WeakMap,
    WeakSet,
    WebRTCMonitorRtpStats: { async countPeerConnections() { return { peers: 0 }; } },
    queueMicrotask,
    setInterval() {},
    window
  }, { filename: "src/main-world.js" });
  await nextTurn();
  await mediaDevices.getUserMedia({ audio: true });

  const deviceMessages = messages.filter(message => message.type === "DEVICES");
  assert.deepEqual(structuredClone(deviceMessages.at(-1).devices), {
    available: [{ kind: "audioinput", label: "USB microphone" }],
    used: [{ kind: "audioinput", label: "USB microphone" }],
    permissions: { camera: "unknown", microphone: "unknown" }
  });

  track.readyState = "ended";
  trackListeners.get("ended")();
  await nextTurn();
  assert.deepEqual(structuredClone(messages.filter(message => message.type === "DEVICES").at(-1).devices.used), []);
});

test("reports permission states and requests media access from an extension message", async () => {
  const listeners = new Map();
  const requests = [];
  const messages = [];
  const track = { kind: "video", label: "Camera", readyState: "live", addEventListener() {}, stop() { this.readyState = "ended"; } };
  const mediaDevices = {
    addEventListener() {},
    async enumerateDevices() { return [{ kind: "videoinput", label: "Camera" }]; },
    async getUserMedia(constraints) { requests.push(constraints); return { getTracks: () => [track] }; }
  };
  const window = {
    navigator: { mediaDevices, permissions: { async query({ name }) { return { state: name === "camera" ? "granted" : "denied" }; } } },
    addEventListener(type, listener) { listeners.set(type, listener); },
    postMessage(message) { messages.push(message); }
  };
  vm.runInNewContext(source, { Promise, Reflect, Set, WeakMap, WeakSet, WebRTCMonitorRtpStats: { async countPeerConnections() { return { peers: 0 }; } }, queueMicrotask, setInterval() {}, window }, { filename: "src/main-world.js" });
  await nextTurn();

  listeners.get("message")({ source: window, data: { source: "webrtc-live-monitor-extension", type: "REQUEST_MEDIA_PERMISSION", kind: "camera" } });
  await nextTurn();

  assert.deepEqual(structuredClone(requests), [{ video: true }]);
  assert.equal(track.readyState, "ended");
  assert.deepEqual(structuredClone(messages.filter(message => message.type === "DEVICES").at(-1).devices.permissions), { camera: "granted", microphone: "denied" });
});
