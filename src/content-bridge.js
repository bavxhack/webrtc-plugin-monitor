(() => {
  "use strict";
  const isCount = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000;
  const isBitrate = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000000;
  const CONNECTION_STATES = ["new", "connecting", "connected", "disconnected", "failed"];
  function validCounts(c) {
    return c && typeof c === "object" && isCount(c.peers) && c.connectionStates &&
      Object.keys(c.connectionStates).length === CONNECTION_STATES.length &&
      CONNECTION_STATES.every(state => isCount(c.connectionStates[state])) &&
      CONNECTION_STATES.reduce((total, state) => total + c.connectionStates[state], 0) <= c.peers &&
      ["audio", "video", "screenShare"].every(kind =>
      c[kind] && isCount(c[kind].inbound) && isCount(c[kind].outbound) && isCount(c[kind].total) &&
      isBitrate(c[kind].inboundBitrate) && isBitrate(c[kind].outboundBitrate) &&
      c[kind].total === c[kind].inbound + c[kind].outbound);
  }
  function send(type, counts) {
    try {
      const payload = type === "FRAME_DEVICES" ? { devices: counts } : { counts };
      const pending = chrome.runtime.sendMessage({ namespace: "webrtc-live-monitor", version: 1, type, ...payload });
      if (pending && typeof pending.catch === "function") pending.catch(() => {});
    } catch {
      // Reloading or updating an extension invalidates content scripts in already
      // open documents. Chrome throws synchronously until that page is reloaded.
    }
  }
  function validDevices(devices) {
    const validList = list => Array.isArray(list) && list.length <= 100 && list.every(device =>
      device && ["audioinput", "audiooutput", "videoinput"].includes(device.kind) &&
      typeof device.label === "string" && device.label.length <= 500);
    const validPermissions = devices?.permissions && ["audioinput", "audiooutput", "videoinput"].every(kind =>
      ["granted", "denied", "prompt", "unavailable"].includes(devices.permissions[kind]));
    return devices && validList(devices.available) && validList(devices.used) && validPermissions;
  }
  window.addEventListener("message", event => {
    if (event.source !== window || !event.data || event.data.source !== "webrtc-live-monitor" || event.data.version !== 2) return;
    if (event.data.type === "COUNTS" && validCounts(event.data.counts)) send("FRAME_COUNTS", event.data.counts);
    if (event.data.type === "DEVICES" && validDevices(event.data.devices)) send("FRAME_DEVICES", event.data.devices);
    if (event.data.type === "FRAME_GONE") send("FRAME_GONE");
  });
  send("FRAME_READY");
})();
