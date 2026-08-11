(function (root) {
  "use strict";
  const INTERNALS_URL = /^chrome:\/\/webrtc-internals\/?(?:[?#].*)?$/i;

  function isWebRTCInternalsUrl(url) {
    return typeof url === "string" && INTERNALS_URL.test(url);
  }
  function comparableUrl(url) {
    try {
      const value = new URL(url);
      value.hash = "";
      return value.href.replace(/\/$/, "");
    } catch {
      return "";
    }
  }
  function urlsMatch(left, right) {
    const a = comparableUrl(left);
    return a !== "" && a === comparableUrl(right);
  }
  function countForUrl(peerConnections, pageUrl) {
    const counts = { peers: 0, audio: { inbound: 0, outbound: 0, total: 0 }, video: { inbound: 0, outbound: 0, total: 0 } };
    for (const connection of Object.values(peerConnections || {})) {
      if (!connection || !urlsMatch(connection.url, pageUrl) || connection.connectionState === "closed") continue;
      counts.peers++;
      const seen = { inbound: new Set(), outbound: new Set() };
      for (const report of latestReports(connection.stats)) {
        const direction = report.type === "inbound-rtp" ? "inbound" : report.type === "outbound-rtp" ? "outbound" : "";
        const kind = report.kind || report.mediaType;
        if (!direction || (kind !== "audio" && kind !== "video") || report.isRemote || report.ended === true) continue;
        const identity = report.trackIdentifier || report.trackId || report.id;
        if (!identity || seen[direction].has(identity)) continue;
        seen[direction].add(identity);
        counts[kind][direction]++;
      }
    }
    for (const kind of ["audio", "video"]) counts[kind].total = counts[kind].inbound + counts[kind].outbound;
    return counts;
  }
  function latestReports(stats) {
    const reports = [];
    for (const [id, history] of Object.entries(stats || {})) {
      let report = Array.isArray(history) ? history[history.length - 1] : history;
      if (!report || typeof report !== "object") continue;
      if (Array.isArray(report.values)) {
        const flat = { id };
        for (let index = 0; index + 1 < report.values.length; index += 2) flat[report.values[index]] = report.values[index + 1];
        report = flat;
      }
      reports.push({ id, ...report });
    }
    return reports;
  }
  const api = { isWebRTCInternalsUrl, urlsMatch, countForUrl };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebRTCInternalsCounting = api;
})(typeof globalThis === "object" ? globalThis : self);
