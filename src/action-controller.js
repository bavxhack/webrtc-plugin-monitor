(function (root) {
  "use strict";

  async function install() {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }

  const api = { install };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebRTCMonitorActionController = api;
})(typeof globalThis === "object" ? globalThis : self);
