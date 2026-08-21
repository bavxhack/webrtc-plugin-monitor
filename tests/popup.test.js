const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync("popup.js", "utf8");

test("popup prioritizes and displays every connection status", () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { addEventListener() {}, append() {}, classList: { toggle() {} }, className: "", getAttribute() { return ""; }, replaceChildren() {}, setAttribute() {}, textContent: "" });
    return elements.get(id);
  };
  let runtimeListener;
  const chrome = {
    runtime: {
      getManifest: () => ({ version: "test" }),
      onMessage: { addListener(listener) { runtimeListener = listener; } },
      sendMessage: async () => ({})
    },
    tabs: { query: async () => [], create: async () => {} }
  };
  vm.runInNewContext(source, {
    chrome,
    Date,
    document: { createElement: () => ({ append() {}, className: "", textContent: "" }), getElementById: element },
    Intl,
    location: { search: "" },
    URLSearchParams,
    window: { close() {} }
  }, { filename: "popup.js" });

  const cases = [
    [{ connected: 1 }, "WebRTC verbunden", "connected"],
    [{ connecting: 1 }, "WebRTC-Verbindung wird aufgebaut", "connecting"],
    [{ disconnected: 1 }, "WebRTC-Verbindung unterbrochen", "disconnected"],
    [{ failed: 1 }, "WebRTC-Verbindung fehlgeschlagen", "failed"],
    [{ new: 1 }, "WebRTC-Verbindung vorbereitet", "new"],
    [{}, "Keine WebRTC-Verbindung erkannt", "idle"]
  ];
  for (const [activeState, text, className] of cases) {
    const connectionStates = { new: 0, connecting: 0, connected: 0, disconnected: 0, failed: 0, ...activeState };
    const media = { inbound: 0, outbound: 0, total: 0, inboundBitrate: 0, outboundBitrate: 0 };
    runtimeListener({ namespace: "webrtc-live-monitor", type: "TAB_UPDATE", tabId: undefined, counts: { peers: Object.values(connectionStates).reduce((sum, value) => sum + value, 0), connectionStates, audio: media, video: media, screenShare: media } });
    assert.equal(element("status").textContent, text);
    assert.equal(element("pulse").className, className);
  }
});

test("device tabs switch their associated panels with mouse and keyboard", () => {
  const elements = new Map();
  const createElement = id => ({
    attributes: new Map(),
    focusCalled: false,
    hidden: false,
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    append() {},
    focus() { this.focusCalled = true; },
    getAttribute(name) { return this.attributes.get(name); },
    replaceChildren() {},
    setAttribute(name, value) { this.attributes.set(name, value); },
    tabIndex: id === "used-devices-tab" ? 0 : -1,
    textContent: ""
  });
  const element = id => {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  };
  element("used-devices-tab").attributes.set("aria-controls", "used-devices-panel");
  element("available-devices-tab").attributes.set("aria-controls", "available-devices-panel");
  element("available-devices-panel").hidden = true;

  const chrome = {
    runtime: { getManifest: () => ({ version: "test" }), onMessage: { addListener() {} }, sendMessage: async () => ({}) },
    tabs: { query: async () => [], create: async () => {} }
  };
  vm.runInNewContext(source, {
    chrome,
    document: { createElement: () => createElement(), getElementById: element },
    Intl,
    location: { search: "" },
    URLSearchParams,
    window: { close() {} }
  }, { filename: "popup.js" });

  element("available-devices-tab").listeners.click();
  assert.equal(element("used-devices-panel").hidden, true);
  assert.equal(element("available-devices-panel").hidden, false);
  assert.equal(element("available-devices-tab").attributes.get("aria-selected"), "true");

  let defaultPrevented = false;
  element("available-devices-tab").listeners.keydown({
    currentTarget: element("available-devices-tab"),
    key: "ArrowRight",
    preventDefault() { defaultPrevented = true; }
  });
  assert.equal(defaultPrevented, true);
  assert.equal(element("used-devices-panel").hidden, false);
  assert.equal(element("used-devices-tab").focusCalled, true);
});
