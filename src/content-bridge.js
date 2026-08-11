(() => {
  "use strict";
  const isCount = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000;
  function validCounts(c) {
    return c && typeof c === "object" && isCount(c.peers) && ["audio", "video"].every(kind =>
      c[kind] && isCount(c[kind].inbound) && isCount(c[kind].outbound) && isCount(c[kind].total) &&
      c[kind].total === c[kind].inbound + c[kind].outbound);
  }
  function send(type, counts) {
    chrome.runtime.sendMessage({ namespace: "webrtc-live-monitor", version: 1, type, counts }).catch(() => {});
  }
  window.addEventListener("message", event => {
    if (event.source !== window || !event.data || event.data.source !== "webrtc-live-monitor" || event.data.version !== 1) return;
    if (event.data.type === "COUNTS" && validCounts(event.data.counts)) send("FRAME_COUNTS", event.data.counts);
    if (event.data.type === "FRAME_GONE") send("FRAME_GONE");
  });
  send("FRAME_READY");
})();
