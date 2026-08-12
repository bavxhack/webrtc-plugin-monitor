(function (root) {
  "use strict";

  const MEDIA_KINDS = ["audio", "video", "screenShare"];
  const emptyMediaCounts = () => ({ inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 });

  function emptyCounts() {
    return { peers: 0, audio: emptyMediaCounts(), video: emptyMediaCounts(), screenShare: emptyMediaCounts() };
  }

  async function countPeerConnections(peers, previous = new WeakMap(), screenShareTracks = new WeakSet()) {
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
      const screenShares = screenShareIdentifiers(pc, screenShareTracks);
      stats.forEach(report => { if (report && report.type === "codec") codecs.set(report.id, report.mimeType || ""); });
      stats.forEach(report => {
        if (!report || (report.type !== "inbound-rtp" && report.type !== "outbound-rtp") || report.isRemote) return;
        const direction = report.type === "inbound-rtp" ? "inbound" : "outbound";
        const mediaKind = report.kind || report.mediaType;
        const kind = mediaKind === "video" && isScreenShareReport(report, screenShares) ? "screenShare" : mediaKind;
        const bytes = direction === "inbound" ? report.bytesReceived : report.bytesSent;
        const packets = direction === "inbound" ? report.packetsReceived : report.packetsSent;
        const codec = (codecs.get(report.codecId) || "").toLowerCase();
        if (!MEDIA_KINDS.includes(kind) || /\/(?:rtx|red|ulpfec|flexfec)/.test(codec) || !Number.isFinite(bytes) || !Number.isFinite(packets) || packets <= 0) return;
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
    for (const kind of MEDIA_KINDS) counts[kind].total = counts[kind].inbound + counts[kind].outbound;
    return counts;
  }

  function screenShareIdentifiers(pc, screenShareTracks) {
    const identifiers = new Set();
    if (typeof pc.getTransceivers !== "function") return identifiers;
    for (const transceiver of pc.getTransceivers()) {
      const track = transceiver?.sender?.track;
      if (!track || !screenShareTracks.has(track)) continue;
      if (track.id) identifiers.add(track.id);
      if (transceiver.mid !== null && transceiver.mid !== undefined) identifiers.add(String(transceiver.mid));
    }
    return identifiers;
  }

  function isScreenShareReport(report, identifiers) {
    const declaredType = report.contentType || report.videoType || report.displaySurface;
    return ["screenshare", "screen", "window", "browser"].includes(declaredType) ||
      identifiers.has(report.trackIdentifier) || identifiers.has(String(report.mid));
  }

  const api = { emptyCounts, countPeerConnections };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebRTCMonitorRtpStats = api;
})(typeof globalThis === "object" ? globalThis : self);
