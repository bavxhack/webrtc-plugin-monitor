(() => {
  "use strict";
  const isCount = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000;
  const isBitrate = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000000;
  function validCounts(c) {
    return c && typeof c === "object" && isCount(c.peers) && ["audio", "video"].every(kind =>
      c[kind] && isCount(c[kind].inbound) && isCount(c[kind].outbound) && isCount(c[kind].total) &&
      isBitrate(c[kind].inboundBitrate) && isBitrate(c[kind].outboundBitrate) &&
      c[kind].total === c[kind].inbound + c[kind].outbound);
  }
  function send(type, counts) {
    try {
      const pending = chrome.runtime.sendMessage({ namespace: "webrtc-live-monitor", version: 1, type, counts });
      if (pending && typeof pending.catch === "function") pending.catch(() => {});
    } catch {
      // Reloading or updating an extension invalidates content scripts in already
      // open documents. Chrome throws synchronously until that page is reloaded.
    }
  }
  window.addEventListener("message", event => {
    if (event.source !== window || !event.data || event.data.source !== "webrtc-live-monitor" || event.data.version !== 1) return;
    if (event.data.type === "COUNTS" && validCounts(event.data.counts)) send("FRAME_COUNTS", event.data.counts);
    if (event.data.type === "FRAME_GONE") send("FRAME_GONE");
  });
  send("FRAME_READY");
})();
