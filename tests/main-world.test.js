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
