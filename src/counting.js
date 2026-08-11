(function (root) {
  "use strict";
  const KINDS = ["audio", "video"];

  function emptyCounts() {
    return { peers: 0, audio: { inbound: 0, outbound: 0, total: 0 }, video: { inbound: 0, outbound: 0, total: 0 } };
  }

  function normalizeCounts(value) {
    const result = emptyCounts();
    if (!value || typeof value !== "object") return result;
    result.peers = integer(value.peers);
    for (const kind of KINDS) {
      result[kind].inbound = integer(value[kind] && value[kind].inbound);
      result[kind].outbound = integer(value[kind] && value[kind].outbound);
      result[kind].total = result[kind].inbound + result[kind].outbound;
    }
    return result;
  }

  function integer(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  function aggregateFrames(frames) {
    const total = emptyCounts();
    for (const frame of Object.values(frames || {})) {
      const counts = normalizeCounts(frame && frame.counts);
      total.peers += counts.peers;
      for (const kind of KINDS) {
        total[kind].inbound += counts[kind].inbound;
        total[kind].outbound += counts[kind].outbound;
        total[kind].total += counts[kind].total;
      }
    }
    return total;
  }

  const api = { emptyCounts, normalizeCounts, aggregateFrames };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebRTCMonitorCounting = api;
})(typeof globalThis === "object" ? globalThis : self);
