const test = require("node:test");
const assert = require("node:assert/strict");
const { emptyCounts, normalizeCounts, aggregateFrames } = require("../src/counting.js");

test("empty state has no peer connections or channels", () => {
  assert.deepEqual(emptyCounts(), { peers: 0, audio: { inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 }, video: { inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 } });
});
test("normalization rejects invalid values and derives totals", () => {
  assert.deepEqual(normalizeCounts({ peers: 1, audio: { inbound: 2, outbound: 3, total: 99 }, video: { inbound: -1, outbound: 1 } }),
    { peers: 1, audio: { inbound: 2, outbound: 3, total: 5, inboundBitrate: 0, outboundBitrate: 0 }, video: { inbound: 0, outbound: 1, total: 1, inboundBitrate: 0, outboundBitrate: 0 } });
});
test("frames and tabs aggregate independently", () => {
  const tabOne = aggregateFrames({ 0: { counts: { peers: 1, audio: { inbound: 1, outbound: 2 }, video: { inbound: 0, outbound: 1 } } }, 4: { counts: { peers: 2, audio: { inbound: 0, outbound: 1 }, video: { inbound: 2, outbound: 0 } } } });
  assert.deepEqual(tabOne, { peers: 3, audio: { inbound: 1, outbound: 3, total: 4, inboundBitrate: 0, outboundBitrate: 0 }, video: { inbound: 2, outbound: 1, total: 3, inboundBitrate: 0, outboundBitrate: 0 } });
  assert.deepEqual(aggregateFrames({ 0: { counts: { peers: 1 } } }), { peers: 1, audio: { inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 }, video: { inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 } });
});
