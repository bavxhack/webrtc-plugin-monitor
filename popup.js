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
  const accessList = byId("device-access");
  accessList.replaceChildren();
  const accessLabels = { microphone: "Mikrofon", camera: "Kamera" };
  const stateLabels = { granted: "Zugriff erlaubt", prompt: "Noch nicht angefragt", denied: "Zugriff blockiert", unknown: "Status nicht verfügbar" };
  for (const permission of ["microphone", "camera"]) {
    const state = devices.access?.[permission] || "unknown";
    const item = document.createElement("li");
    item.className = `permission-${state}`;
    const kind = document.createElement("span");
    const status = document.createElement("strong");
    kind.textContent = accessLabels[permission];
    status.textContent = stateLabels[state];
    item.append(kind, status);
    accessList.append(item);
  }
}

function installDeviceTabs() {
  const section = document.querySelector(".devices");
  if (!section) return;
  const usedHeading = byId("used-devices").previousElementSibling;
  const availableHeading = byId("available-devices").previousElementSibling;
  const tabs = document.createElement("div");
  tabs.className = "device-tabs";
  tabs.setAttribute("role", "tablist");
  const panels = [
    { id: "access", label: "Zugriff", list: document.createElement("ul") },
    { id: "used", label: "Verwendet", list: byId("used-devices") },
    { id: "available", label: "Verfügbar", list: byId("available-devices") }
  ];
  panels[0].list.id = "device-access";
  for (const [index, panel] of panels.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `device-tab-${panel.id}`;
    button.textContent = panel.label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `device-panel-${panel.id}`);
    const container = document.createElement("div");
    container.id = `device-panel-${panel.id}`;
    container.className = "device-tab-panel";
    container.setAttribute("role", "tabpanel");
    container.setAttribute("aria-labelledby", button.id);
    container.append(panel.list);
    const select = () => panels.forEach((candidate, candidateIndex) => {
      const selected = candidateIndex === index;
      tabs.children[candidateIndex].setAttribute("aria-selected", String(selected));
      tabs.children[candidateIndex].tabIndex = selected ? 0 : -1;
      section.querySelector(`#device-panel-${candidate.id}`).hidden = !selected;
    });
    button.addEventListener("click", select);
    tabs.append(button);
    section.insertBefore(container, section.querySelector(".device-note"));
    if (index === 0) queueMicrotask(select);
  }
  usedHeading.remove();
  availableHeading.remove();
  section.querySelector(".section-heading").after(tabs);
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
installDeviceTabs();
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
