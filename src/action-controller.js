(function (root) {
  "use strict";

  const POPUP_URL = "popup.html";
  let popupWindowId = null;

  async function openPopupWindow(tabId) {
    if (Number.isInteger(popupWindowId)) {
      try {
        await chrome.windows.update(popupWindowId, { focused: true });
        return;
      } catch {
        popupWindowId = null;
      }
    }

    const popupUrl = new URL(chrome.runtime.getURL(POPUP_URL));
    if (Number.isInteger(tabId)) popupUrl.searchParams.set("tabId", String(tabId));
    const popupWindow = await chrome.windows.create({
      url: popupUrl.href,
      type: "popup",
      width: 380,
      height: 590,
      focused: true
    });
    popupWindowId = Number.isInteger(popupWindow?.id) ? popupWindow.id : null;
  }

  function install() {
    chrome.action.onClicked.addListener(tab => {
      openPopupWindow(tab?.id).catch(error => console.error("WebRTC Live Monitor popup could not be opened.", error));
    });
    chrome.windows.onRemoved.addListener(windowId => {
      if (windowId === popupWindowId) popupWindowId = null;
    });
  }

  const api = { install, openPopupWindow };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebRTCMonitorActionController = api;
})(typeof globalThis === "object" ? globalThis : self);
