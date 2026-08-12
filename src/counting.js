(function (root) {
  "use strict";
  const KINDS = ["audio", "video", "screenShare"];
  const CONNECTION_STATES = ["new", "connecting", "connected", "disconnected", "failed"];
  const emptyMediaCounts = () => ({ inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 });
  const emptyConnectionStates = () => Object.fromEntries(CONNECTION_STATES.map(state => [state, 0]));

  function emptyCounts() {
    return { peers: 0, connectionStates: emptyConnectionStates(), audio: emptyMediaCounts(), video: emptyMediaCounts(), screenShare: emptyMediaCounts() };
  }

  function normalizeCounts(value) {
    const result = emptyCounts();
    if (!value || typeof value !== "object") return result;
    result.peers = integer(value.peers);
    for (const state of CONNECTION_STATES) result.connectionStates[state] = integer(value.connectionStates?.[state]);
    for (const kind of KINDS) {
      result[kind].inbound = integer(value[kind] && value[kind].inbound);
      result[kind].outbound = integer(value[kind] && value[kind].outbound);
      result[kind].total = result[kind].inbound + result[kind].outbound;
      result[kind].inboundBitrate = integer(value[kind] && value[kind].inboundBitrate);
      result[kind].outboundBitrate = integer(value[kind] && value[kind].outboundBitrate);
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
      for (const state of CONNECTION_STATES) total.connectionStates[state] += counts.connectionStates[state];
      for (const kind of KINDS) {
        total[kind].inbound += counts[kind].inbound;
        total[kind].outbound += counts[kind].outbound;
        total[kind].total += counts[kind].total;
        total[kind].inboundBitrate += counts[kind].inboundBitrate;
        total[kind].outboundBitrate += counts[kind].outboundBitrate;
      }
    }
    return total;
  }

  const api = { emptyCounts, normalizeCounts, aggregateFrames };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebRTCMonitorCounting = api;
})(typeof globalThis === "object" ? globalThis : self);
