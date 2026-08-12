const test = require("node:test");
const assert = require("node:assert/strict");
const { emptyCounts, normalizeCounts, aggregateFrames } = require("../src/counting.js");

const emptyMedia = () => ({ inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 });
const emptyStates = () => ({ new: 0, connecting: 0, connected: 0, disconnected: 0, failed: 0 });

test("empty state has no peer connections, states or channels", () => {
  assert.deepEqual(emptyCounts(), {
    peers: 0,
    connectionStates: emptyStates(),
    audio: emptyMedia(),
    video: emptyMedia(),
    screenShare: emptyMedia()
  });
});

test("normalization accepts known states and ignores manipulated values", () => {
  const result = normalizeCounts({
    peers: 4,
    connectionStates: { new: 1, connecting: -1, connected: 2, disconnected: "1", failed: 1, unknown: 99 },
    audio: { inbound: 2, outbound: 3, total: 99 },
    video: { inbound: -1, outbound: 1 }
  });

  assert.deepEqual(result.connectionStates, { new: 1, connecting: 0, connected: 2, disconnected: 0, failed: 1 });
  assert.deepEqual(result.audio, { inbound: 2, outbound: 3, total: 5, inboundBitrate: 0, outboundBitrate: 0 });
  assert.deepEqual(result.video, { inbound: 0, outbound: 1, total: 1, inboundBitrate: 0, outboundBitrate: 0 });
});

test("connection states aggregate across multiple frames", () => {
  const result = aggregateFrames({
    0: { counts: { peers: 2, connectionStates: { new: 1, connected: 1 } } },
    4: { counts: { peers: 3, connectionStates: { connecting: 1, disconnected: 1, failed: 1 } } }
  });

  assert.equal(result.peers, 5);
  assert.deepEqual(result.connectionStates, { new: 1, connecting: 1, connected: 1, disconnected: 1, failed: 1 });
});

test("media and bitrate values remain separate while aggregating screen shares", () => {
  const result = aggregateFrames({
    0: { counts: { audio: { inbound: 1, inboundBitrate: 800 }, screenShare: { inbound: 1, inboundBitrate: 1200 } } },
    1: { counts: { video: { outbound: 1, outboundBitrate: 2400 }, screenShare: { outbound: 1, outboundBitrate: 3400 } } }
  });

  assert.deepEqual(result.audio, { inbound: 1, outbound: 0, total: 1, inboundBitrate: 800, outboundBitrate: 0 });
  assert.deepEqual(result.video, { inbound: 0, outbound: 1, total: 1, inboundBitrate: 0, outboundBitrate: 2400 });
  assert.deepEqual(result.screenShare, { inbound: 1, outbound: 1, total: 2, inboundBitrate: 1200, outboundBitrate: 3400 });
});
