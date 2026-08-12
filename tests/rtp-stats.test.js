const test = require("node:test");
const assert = require("node:assert/strict");
const { countPeerConnections } = require("../src/rtp-stats.js");

const reportSet = reports => ({ forEach(callback) { reports.forEach(callback); } });
const peer = snapshots => ({ connectionState: "connected", async getStats() { return reportSet(snapshots.shift()); } });

test("counts only RTP streams which have received or sent packets", async () => {
  const pc = peer([[{ id: "empty", type: "inbound-rtp", kind: "audio", packetsReceived: 0, bytesReceived: 0, timestamp: 1000 }, { id: "live", type: "inbound-rtp", kind: "video", mid: "1", packetsReceived: 2, bytesReceived: 500, timestamp: 1000 }]]);
  const result = await countPeerConnections([pc]);
  assert.equal(result.audio.inbound, 0);
  assert.equal(result.video.inbound, 1);
});

test("deduplicates simulcast by mid and excludes RTX", async () => {
  const pc = peer([[{ id: "codec", type: "codec", mimeType: "video/rtx" }, { id: "main-1", type: "inbound-rtp", kind: "video", mid: "2", packetsReceived: 2, bytesReceived: 500, timestamp: 1000 }, { id: "main-2", type: "inbound-rtp", kind: "video", mid: "2", packetsReceived: 3, bytesReceived: 600, timestamp: 1000 }, { id: "repair", type: "inbound-rtp", kind: "video", mid: "2", codecId: "codec", packetsReceived: 4, bytesReceived: 700, timestamp: 1000 }]]);
  assert.equal((await countPeerConnections([pc])).video.inbound, 1);
});

test("calculates inbound and outbound bitrate from consecutive internals stats", async () => {
  const pc = peer([
    [{ id: "in", type: "inbound-rtp", kind: "audio", packetsReceived: 1, bytesReceived: 1000, timestamp: 1000 }, { id: "out", type: "outbound-rtp", kind: "video", packetsSent: 1, bytesSent: 2000, timestamp: 1000 }],
    [{ id: "in", type: "inbound-rtp", kind: "audio", packetsReceived: 2, bytesReceived: 3000, timestamp: 2000 }, { id: "out", type: "outbound-rtp", kind: "video", packetsSent: 2, bytesSent: 6000, timestamp: 2000 }]
  ]);
  const history = new WeakMap();
  await countPeerConnections([pc], history);
  const result = await countPeerConnections([pc], history);
  assert.equal(result.audio.inboundBitrate, 16000);
  assert.equal(result.video.outboundBitrate, 32000);
});
