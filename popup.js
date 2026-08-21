"use strict";
let activeTabId;
const byId = id => document.getElementById(id);
const CONNECTION_STATES = ["new", "connecting", "connected", "disconnected", "failed"];
byId("version").textContent = chrome.runtime.getManifest().version;

class DevicesTabsController {
  constructor(tabIds) {
    this.tabs = tabIds.map(byId);
    for (const tab of this.tabs) {
      tab.addEventListener("click", () => this.select(tab));
      tab.addEventListener("keydown", event => this.handleKeydown(event));
    }
  }

  select(selectedTab, { focus = false } = {}) {
    for (const tab of this.tabs) {
      const isSelected = tab === selectedTab;
      tab.setAttribute("aria-selected", String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      byId(tab.getAttribute("aria-controls")).hidden = !isSelected;
    }
    if (focus) selectedTab.focus();
  }

  handleKeydown(event) {
    const currentIndex = this.tabs.indexOf(event.currentTarget);
    const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    const nextIndex = (currentIndex + direction + this.tabs.length) % this.tabs.length;
    this.select(this.tabs[nextIndex], { focus: true });
  }
}

new DevicesTabsController(["used-devices-tab", "available-devices-tab"]);
function render(c) {
  byId("peers").textContent = c.peers;
  for (const state of CONNECTION_STATES) byId(`state-${state}`).textContent = c.connectionStates[state];
  for (const kind of ["audio", "video", "screenShare"]) {
    byId(`${kind}-in`).textContent = c[kind].inbound;
    byId(`${kind}-out`).textContent = c[kind].outbound;
    byId(`${kind}-total`).textContent = c[kind].total;
    byId(`${kind}-in-bitrate`).textContent = formatBitrate(c[kind].inboundBitrate);
    byId(`${kind}-out-bitrate`).textContent = formatBitrate(c[kind].outboundBitrate);
  }
  const status = connectionStatus(c);
  byId("status").textContent = status.text;
  byId("pulse").className = status.className;
  byId("updated").textContent = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
}
function renderDevices(devices = { available: [], used: [] }) {
  const labels = { audioinput: "Mikrofon", audiooutput: "Lautsprecher", videoinput: "Kamera" };
  const renderList = (id, list, emptyText) => {
    const target = byId(id);
    target.replaceChildren();
    if (!list.length) {
      const item = document.createElement("li");
      item.className = "empty";
      item.textContent = emptyText;
      target.append(item);
      return;
    }
    for (const device of list) {
      const item = document.createElement("li");
      const kind = document.createElement("span");
      const name = document.createElement("strong");
      kind.textContent = labels[device.kind] || "Gerät";
      name.textContent = device.label || "Bezeichnung erst nach Freigabe sichtbar";
      item.append(kind, name);
      target.append(item);
    }
  };
  renderList("used-devices", devices.used || [], "Keine Geräte verwendet");
  renderList("available-devices", devices.available || [], "Keine Geräte erkannt");
}
function connectionStatus(c) {
  if (c.connectionStates.connected > 0) return { text: "WebRTC verbunden", className: "connected" };
  if (c.connectionStates.connecting > 0) return { text: "WebRTC-Verbindung wird aufgebaut", className: "connecting" };
  if (c.connectionStates.disconnected > 0) return { text: "WebRTC-Verbindung unterbrochen", className: "disconnected" };
  if (c.connectionStates.failed > 0) return { text: "WebRTC-Verbindung fehlgeschlagen", className: "failed" };
  if (c.connectionStates.new > 0) return { text: "WebRTC-Verbindung vorbereitet", className: "new" };
  return { text: "Keine WebRTC-Verbindung erkannt", className: "idle" };
}
function formatBitrate(bitsPerSecond) {
  if (bitsPerSecond >= 1000000) return `${(bitsPerSecond / 1000000).toFixed(1)} Mbit/s`;
  return `${Math.round(bitsPerSecond / 1000)} kbit/s`;
}
async function refresh() {
  const requestedTab = new URLSearchParams(location.search).get("tabId");
  const requestedTabId = requestedTab === null ? NaN : Number(requestedTab);
  if (Number.isInteger(requestedTabId) && requestedTabId >= 0) activeTabId = requestedTabId;
  else {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    activeTabId = tab?.id;
  }
  if (!Number.isInteger(activeTabId)) return;
  const response = await chrome.runtime.sendMessage({ namespace: "webrtc-live-monitor", type: "GET_TAB", tabId: activeTabId });
  render(response.counts);
  renderDevices(response.devices);
}
chrome.runtime.onMessage.addListener(message => {
  if (message && message.namespace === "webrtc-live-monitor" && message.type === "TAB_UPDATE" && message.tabId === activeTabId) {
    render(message.counts);
    renderDevices(message.devices);
  }
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
