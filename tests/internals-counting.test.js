const test = require("node:test");
const assert = require("node:assert/strict");
const { isWebRTCInternalsUrl, urlsMatch, countForUrl } = require("../src/internals-counting.js");

test("matches only the WebRTC internals WebUI URL", () => {
  assert.equal(isWebRTCInternalsUrl("chrome://webrtc-internals/"), true);
  assert.equal(isWebRTCInternalsUrl("chrome://webrtc-internals/#event-log"), true);
  assert.equal(isWebRTCInternalsUrl("https://example.test/webrtc-internals"), false);
});
test("matches page URLs while ignoring fragments and a trailing slash", () => {
  assert.equal(urlsMatch("https://example.test/call/#room", "https://example.test/call"), true);
  assert.equal(urlsMatch("https://example.test/other", "https://example.test/call"), false);
});
test("extracts and deduplicates displayed inbound and outbound RTP tracks", () => {
  const peers = {
    first: { url: "https://example.test/call#one", stats: {
      audio: [{ values: ["type", "inbound-rtp", "kind", "audio", "trackIdentifier", "mic"] }],
      duplicate: [{ values: ["type", "inbound-rtp", "mediaType", "audio", "trackIdentifier", "mic"] }],
      video: { type: "outbound-rtp", kind: "video", trackIdentifier: "camera" },
      remote: { type: "inbound-rtp", kind: "video", trackIdentifier: "remote-copy", isRemote: true }
    } },
    other: { url: "https://other.test/", stats: { x: { type: "inbound-rtp", kind: "video", id: "x" } } }
  };
  assert.deepEqual(countForUrl(peers, "https://example.test/call"), {
    peers: 1, audio: { inbound: 1, outbound: 0, total: 1 }, video: { inbound: 0, outbound: 1, total: 1 }
  });
});
