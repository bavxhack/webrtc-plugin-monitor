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
    navigator: { mediaDevices, permissions: { async query({ name }) { return { state: name === "microphone" ? "granted" : "prompt" }; } } },
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
    access: { camera: "prompt", microphone: "granted" },
    available: [{ kind: "audioinput", label: "USB microphone" }],
    used: [{ kind: "audioinput", label: "USB microphone" }]
  });

  track.readyState = "ended";
  trackListeners.get("ended")();
  await nextTurn();
  assert.deepEqual(structuredClone(messages.filter(message => message.type === "DEVICES").at(-1).devices.used), []);
});

test("reports device lists even while a permission query remains pending", async () => {
  const messages = [];
  const mediaDevices = {
    addEventListener() {},
    async enumerateDevices() { return [{ kind: "videoinput", label: "Camera" }]; }
  };
  const window = {
    navigator: { mediaDevices, permissions: { query() { return new Promise(() => {}); } } },
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

  const devices = structuredClone(messages.find(message => message.type === "DEVICES").devices);
  assert.deepEqual(devices, {
    access: { camera: "unknown", microphone: "unknown" },
    available: [{ kind: "videoinput", label: "Camera" }],
    used: []
  });
});
