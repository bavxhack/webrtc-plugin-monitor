(function (root) {
  "use strict";
  function countPeerConnections(peers, identity = track => track) {
    const counts = { peers: 0, audio: { inbound: 0, outbound: 0, total: 0 }, video: { inbound: 0, outbound: 0, total: 0 } };
    for (const pc of peers) {
      if (pc.connectionState === "closed") continue;
      counts.peers++;
      count(pc.getSenders(), "outbound", counts, identity);
      count(receivingRtpObjects(pc), "inbound", counts, identity);
    }
    counts.audio.total = counts.audio.inbound + counts.audio.outbound;
    counts.video.total = counts.video.inbound + counts.video.outbound;
    return counts;
  }
  function receivingRtpObjects(pc) {
    if (typeof pc.getTransceivers !== "function") return pc.getReceivers();
    return pc.getTransceivers()
      .filter(transceiver => transceiver && !transceiver.stopped &&
        (transceiver.currentDirection === "recvonly" || transceiver.currentDirection === "sendrecv"))
      .map(transceiver => transceiver.receiver);
  }
  function count(items, direction, counts, identity) {
    const seen = new Set();
    for (const item of items) {
      const track = item && item.track;
      if (!track || track.readyState === "ended" || (track.kind !== "audio" && track.kind !== "video")) continue;
      const id = identity(track);
      if (seen.has(id)) continue;
      seen.add(id);
      counts[track.kind][direction]++;
    }
  }
  const api = { countPeerConnections };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebRTCMonitorPeerCounting = api;
})(typeof globalThis === "object" ? globalThis : self);
