"use strict";
let activeTabId;
const byId = id => document.getElementById(id);
const CONNECTION_STATES = ["new", "connecting", "connected", "disconnected", "failed"];
byId("version").textContent = chrome.runtime.getManifest().version;
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
const DEVICE_KINDS = ["audioinput", "videoinput", "audiooutput"];
const EMPTY_DEVICE_LABELS = { audioinput: "Keine Mikrofone erkannt", audiooutput: "Keine Ausgabegeräte erkannt", videoinput: "Keine Kameras erkannt" };
function renderDevices(devices = { available: [], used: [], permissions: {} }) {
  for (const deviceKind of DEVICE_KINDS) {
    const available = (devices.available || []).filter(device => device.kind === deviceKind);
    const usedLabels = new Set((devices.used || []).filter(device => device.kind === deviceKind).map(device => device.label));
    const target = byId(`devices-${deviceKind}`);
    target.replaceChildren();
    byId(`count-${deviceKind}`).textContent = available.length;
    const permission = devices.permissions?.[deviceKind] || "unavailable";
    const access = byId(`access-${deviceKind}`);
    const accessLabels = {
      granted: "Zugriff erlaubt",
      denied: "Zugriff blockiert",
      prompt: "Zugriff noch nicht angefragt",
      unavailable: "Berechtigungsstatus nicht verfügbar"
    };
    access.className = `access-state ${permission}`;
    access.textContent = accessLabels[permission] || accessLabels.unavailable;
    if (!available.length) {
      const item = document.createElement("li");
      item.className = "empty";
      item.textContent = EMPTY_DEVICE_LABELS[deviceKind];
      target.append(item);
      continue;
    }
    for (const device of available) {
      const item = document.createElement("li");
      const name = document.createElement("strong");
      const state = document.createElement("span");
      name.textContent = device.label || "Bezeichnung erst nach Freigabe sichtbar";
      const inUse = usedLabels.has(device.label) && device.label !== "";
      state.className = inUse ? "device-use active" : "device-use";
      state.textContent = inUse ? "Gerade verwendet" : permission === "granted" ? "Zugriff möglich" : "Nicht freigegeben";
      item.append(name, state);
      target.append(item);
    }
  }
}
function activateDeviceTab(tab) {
  for (const candidate of document.querySelectorAll(".device-tab")) {
    const active = candidate === tab;
    candidate.classList.toggle("active", active);
    candidate.setAttribute("aria-selected", String(active));
    candidate.tabIndex = active ? 0 : -1;
    byId(`panel-${candidate.dataset.deviceKind}`).hidden = !active;
  }
}
for (const tab of document.querySelectorAll(".device-tab")) {
  tab.addEventListener("click", () => activateDeviceTab(tab));
  tab.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const tabs = [...document.querySelectorAll(".device-tab")];
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(tabs.indexOf(tab) + offset + tabs.length) % tabs.length];
    activateDeviceTab(next);
    next.focus();
  });
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
