(function (root) {
  "use strict";

  function emptyCounts() {
    return { peers: 0, audio: { inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 }, video: { inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 } };
  }

  async function countPeerConnections(peers, previous = new WeakMap()) {
    const counts = emptyCounts();
    await Promise.all(Array.from(peers, async pc => {
      if (pc.connectionState === "closed") return;
      counts.peers++;
      let stats;
      try { stats = await pc.getStats(); } catch { return; }
      const prior = previous.get(pc) || new Map();
      const next = new Map();
      const seen = { inbound: new Set(), outbound: new Set() };
      const codecs = new Map();
      stats.forEach(report => { if (report && report.type === "codec") codecs.set(report.id, report.mimeType || ""); });
      stats.forEach(report => {
        if (!report || (report.type !== "inbound-rtp" && report.type !== "outbound-rtp") || report.isRemote) return;
        const direction = report.type === "inbound-rtp" ? "inbound" : "outbound";
        const kind = report.kind || report.mediaType;
        const bytes = direction === "inbound" ? report.bytesReceived : report.bytesSent;
        const packets = direction === "inbound" ? report.packetsReceived : report.packetsSent;
        const codec = (codecs.get(report.codecId) || "").toLowerCase();
        if ((kind !== "audio" && kind !== "video") || /\/(?:rtx|red|ulpfec|flexfec)/.test(codec) || !Number.isFinite(bytes) || !Number.isFinite(packets) || packets <= 0) return;
        const streamKey = `${kind}:${report.mid || report.trackIdentifier || report.ssrc || report.id}`;
        if (!seen[direction].has(streamKey)) {
          seen[direction].add(streamKey);
          counts[kind][direction]++;
        }
        const timestamp = Number(report.timestamp);
        next.set(report.id, { bytes, timestamp });
        const old = prior.get(report.id);
        if (!old || bytes < old.bytes || timestamp <= old.timestamp) return;
        const bitrate = Math.round((bytes - old.bytes) * 8000 / (timestamp - old.timestamp));
        if (Number.isSafeInteger(bitrate) && bitrate >= 0) counts[kind][`${direction}Bitrate`] += bitrate;
      });
      previous.set(pc, next);
    }));
    for (const kind of ["audio", "video"]) counts[kind].total = counts[kind].inbound + counts[kind].outbound;
    return counts;
  }

  const api = { emptyCounts, countPeerConnections };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebRTCMonitorRtpStats = api;
})(typeof globalThis === "object" ? globalThis : self);
