"use strict";
let activeTabId;
const byId = id => document.getElementById(id);
byId("version").textContent = chrome.runtime.getManifest().version;
function render(c) {
  byId("peers").textContent = c.peers;
  for (const kind of ["audio", "video", "screenShare"]) {
    byId(`${kind}-in`).textContent = c[kind].inbound;
    byId(`${kind}-out`).textContent = c[kind].outbound;
    byId(`${kind}-total`).textContent = c[kind].total;
    byId(`${kind}-in-bitrate`).textContent = formatBitrate(c[kind].inboundBitrate);
    byId(`${kind}-out-bitrate`).textContent = formatBitrate(c[kind].outboundBitrate);
  }
  const active = c.peers > 0;
  byId("status").textContent = active ? "WebRTC aktiv" : "Keine WebRTC-Verbindung erkannt";
  byId("pulse").classList.toggle("active", active);
  byId("updated").textContent = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
}
function formatBitrate(bitsPerSecond) {
  if (bitsPerSecond >= 1000000) return `${(bitsPerSecond / 1000000).toFixed(1)} Mbit/s`;
  return `${Math.round(bitsPerSecond / 1000)} kbit/s`;
}
async function refresh() {
  const requestedTabId = Number(new URLSearchParams(location.search).get("tabId"));
  if (Number.isInteger(requestedTabId) && requestedTabId >= 0) activeTabId = requestedTabId;
  else {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    activeTabId = tab?.id;
  }
  if (!Number.isInteger(activeTabId)) return;
  const response = await chrome.runtime.sendMessage({ namespace: "webrtc-live-monitor", type: "GET_TAB", tabId: activeTabId });
  render(response.counts);
}
chrome.runtime.onMessage.addListener(message => {
  if (message && message.namespace === "webrtc-live-monitor" && message.type === "TAB_UPDATE" && message.tabId === activeTabId) render(message.counts);
});
byId("demo").addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("demo.html") });
  window.close();
});
byId("reset").addEventListener("click", async () => {
  if (Number.isInteger(activeTabId)) await chrome.runtime.sendMessage({ namespace: "webrtc-live-monitor", type: "RESET_TAB", tabId: activeTabId });
});
refresh().catch(error => {
  byId("status").textContent = "Monitor konnte nicht geladen werden";
  byId("help").textContent = error.message;
});
