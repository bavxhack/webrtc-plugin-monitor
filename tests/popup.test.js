const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync("popup.js", "utf8");

test("popup prioritizes and displays every connection status", () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { addEventListener() {}, classList: { toggle() {} }, className: "", textContent: "" });
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
    document: { getElementById: element },
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
