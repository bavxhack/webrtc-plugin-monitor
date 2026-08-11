const test = require("node:test");
const assert = require("node:assert/strict");
const { countPeerConnections } = require("../src/peer-counting.js");
const track = (kind, readyState = "live") => ({ kind, readyState });
const peer = ({ state = "new", senders = [], receivers = [] } = {}) => ({ connectionState: state, getSenders: () => senders, getReceivers: () => receivers });

test("open peer without tracks is retained", () => assert.equal(countPeerConnections([peer()]).peers, 1));
test("outbound audio and audio/video are classified", () => {
  const audio = track("audio"), video = track("video");
  assert.deepEqual(countPeerConnections([peer({ senders: [{ track: audio }, { track: video }] })]),
    { peers: 1, audio: { inbound: 0, outbound: 1, total: 1 }, video: { inbound: 0, outbound: 1, total: 1 } });
});
test("multiple peers and inbound tracks aggregate", () => {
  const result = countPeerConnections([peer({ receivers: [{ track: track("audio") }] }), peer({ receivers: [{ track: track("video") }] })]);
  assert.equal(result.peers, 2); assert.equal(result.audio.inbound, 1); assert.equal(result.video.inbound, 1);
});
test("duplicate track in one direction is counted once", () => {
  const audio = track("audio");
  assert.equal(countPeerConnections([peer({ senders: [{ track: audio }, { track: audio }] })]).audio.outbound, 1);
});
test("replacement is reflected by the next snapshot", () => {
  const sender = { track: track("audio") }, pc = peer({ senders: [sender] });
  sender.track = track("video");
  assert.equal(countPeerConnections([pc]).video.outbound, 1);
});
test("ended, removed, null and closed tracks are excluded", () => {
  const ended = track("audio", "ended");
  const result = countPeerConnections([peer({ senders: [{ track: ended }, { track: null }] }), peer({ state: "closed", senders: [{ track: track("video") }] })]);
  assert.deepEqual(result, { peers: 1, audio: { inbound: 0, outbound: 0, total: 0 }, video: { inbound: 0, outbound: 0, total: 0 } });
});
