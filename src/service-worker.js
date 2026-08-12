"use strict";
importScripts("counting.js", "action-controller.js");
WebRTCMonitorActionController.install();
const STORAGE_KEY = "tabFrames";
let statePromise = chrome.storage.session.get(STORAGE_KEY).then(data => data[STORAGE_KEY] || {});
const save = state => chrome.storage.session.set({ [STORAGE_KEY]: state });
const keyFor = sender => String(sender.frameId ?? 0);
const isMissingTabError = error => error instanceof Error && /^No tab with id: \d+\.?$/.test(error.message);

function runTask(task, context) {
  Promise.resolve()
    .then(task)
    .catch(error => console.error(`WebRTC Live Monitor: ${context} failed.`, error));
}

async function mutate(fn) {
  const state = await statePromise;
  fn(state);
  await save(state);
  return state;
}
async function tabCounts(tabId) {
  const state = await statePromise;
  return WebRTCMonitorCounting.aggregateFrames(state[String(tabId)] || {});
}
async function publish(tabId) {
  const counts = await tabCounts(tabId);
  const badge = counts.audio.total + counts.video.total;
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#3659c9" });
    await chrome.action.setBadgeText({ tabId, text: badge ? String(badge) : "" });
  } catch (error) {
    if (!isMissingTabError(error)) throw error;
    await mutate(state => { delete state[String(tabId)]; });
    return;
  }
  chrome.runtime.sendMessage({ namespace: "webrtc-live-monitor", type: "TAB_UPDATE", tabId, counts }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.namespace !== "webrtc-live-monitor") return false;
  if (message.type === "GET_TAB" || message.type === "RESET_TAB") {
    if (sender.tab || !Number.isInteger(message.tabId)) return false;
    if (message.type === "GET_TAB") {
      tabCounts(message.tabId).then(counts => sendResponse({ counts })).catch(() => sendResponse({ counts: WebRTCMonitorCounting.emptyCounts() }));
    } else {
      mutate(state => { delete state[String(message.tabId)]; })
        .then(() => publish(message.tabId))
        .then(() => sendResponse({ ok: true }))
        .catch(error => {
          console.error("WebRTC Live Monitor: resetting the tab failed.", error);
          sendResponse({ ok: false });
        });
    }
    return true;
  }
  if (!sender.tab || !Number.isInteger(sender.tab.id)) return false;
  const tabId = sender.tab.id;
  if (message.type === "FRAME_READY") {
    mutate(state => {
      const frames = state[String(tabId)] ||= {};
      const key = keyFor(sender);
      if (frames[key] && frames[key].documentId !== sender.documentId) delete frames[key];
    }).then(() => publish(tabId)).catch(error => console.error("WebRTC Live Monitor: processing FRAME_READY failed.", error));
  } else if (message.type === "FRAME_COUNTS") {
    mutate(state => {
      const frames = state[String(tabId)] ||= {};
      frames[keyFor(sender)] = { documentId: sender.documentId || "", counts: WebRTCMonitorCounting.normalizeCounts(message.counts), updatedAt: Date.now() };
    }).then(() => publish(tabId)).catch(error => console.error("WebRTC Live Monitor: processing FRAME_COUNTS failed.", error));
  } else if (message.type === "FRAME_GONE") {
    runTask(
      () => mutate(state => { if (state[String(tabId)]) delete state[String(tabId)][keyFor(sender)]; }).then(() => publish(tabId)),
      "processing FRAME_GONE"
    );
  }
  return false;
});

chrome.webNavigation.onCommitted.addListener(details => {
  mutate(state => {
    const tab = state[String(details.tabId)];
    if (details.frameId === 0) delete state[String(details.tabId)];
    else if (tab) delete tab[String(details.frameId)];
  }).then(() => publish(details.tabId)).catch(error => console.error("WebRTC Live Monitor: processing navigation failed.", error));
});
chrome.tabs.onRemoved.addListener(tabId => {
  runTask(() => mutate(state => { delete state[String(tabId)]; }), "removing closed tab state");
});
chrome.runtime.onStartup.addListener(() => {
  runTask(async () => {
    const state = await statePromise;
    await Promise.all(Object.keys(state).map(tabId => publish(Number(tabId))));
  }, "restoring tab state");
});
