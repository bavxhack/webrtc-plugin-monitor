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
function normalizeDevices(devices) {
  const normalize = list => Array.isArray(list) ? list.map(({ kind, label }) => ({ kind, label })).slice(0, 100) : [];
  const state = value => ["granted", "prompt", "denied", "unknown"].includes(value) ? value : "unknown";
  return {
    available: normalize(devices?.available),
    used: normalize(devices?.used),
    permissions: { camera: state(devices?.permissions?.camera), microphone: state(devices?.permissions?.microphone) }
  };
}
async function tabDevices(tabId) {
  const state = await statePromise;
  const frames = Object.values(state[String(tabId)] || {});
  const unique = list => [...new Map(list.map(device => [`${device.kind}\0${device.label}`, device])).values()];
  return {
    available: unique(frames.flatMap(frame => frame.devices?.available || [])),
    used: unique(frames.flatMap(frame => frame.devices?.used || [])),
    permissions: frames.reduce((result, frame) => {
      for (const kind of ["camera", "microphone"]) {
        const current = frame.devices?.permissions?.[kind];
        if (current === "granted" || result[kind] === "unknown") result[kind] = current || result[kind];
      }
      return result;
    }, { camera: "unknown", microphone: "unknown" })
  };
}
async function publish(tabId) {
  const [counts, devices] = await Promise.all([tabCounts(tabId), tabDevices(tabId)]);
  const badge = counts.audio.total + counts.video.total + counts.screenShare.total;
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#3659c9" });
    await chrome.action.setBadgeText({ tabId, text: badge ? String(badge) : "" });
  } catch (error) {
    if (!isMissingTabError(error)) throw error;
    await mutate(state => { delete state[String(tabId)]; });
    return;
  }
  chrome.runtime.sendMessage({ namespace: "webrtc-live-monitor", type: "TAB_UPDATE", tabId, counts, devices }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.namespace !== "webrtc-live-monitor") return false;
  if (message.type === "GET_TAB" || message.type === "RESET_TAB") {
    if (sender.tab || !Number.isInteger(message.tabId)) return false;
    if (message.type === "GET_TAB") {
      Promise.all([tabCounts(message.tabId), tabDevices(message.tabId)])
        .then(([counts, devices]) => sendResponse({ counts, devices }))
        .catch(() => sendResponse({ counts: WebRTCMonitorCounting.emptyCounts(), devices: { available: [], used: [] } }));
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
  if (message.type === "REQUEST_MEDIA_PERMISSION") {
    if (sender.tab || !Number.isInteger(message.tabId) || !["camera", "microphone"].includes(message.kind)) return false;
    chrome.tabs.sendMessage(message.tabId, message, { frameId: 0 })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
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
      const previous = frames[keyFor(sender)];
      frames[keyFor(sender)] = {
        documentId: sender.documentId || "",
        counts: WebRTCMonitorCounting.normalizeCounts(message.counts),
        devices: previous?.devices,
        updatedAt: Date.now()
      };
    }).then(() => publish(tabId)).catch(error => console.error("WebRTC Live Monitor: processing FRAME_COUNTS failed.", error));
  } else if (message.type === "FRAME_DEVICES") {
    mutate(state => {
      const frames = state[String(tabId)] ||= {};
      const frame = frames[keyFor(sender)] ||= { documentId: sender.documentId || "", counts: WebRTCMonitorCounting.emptyCounts(), updatedAt: Date.now() };
      frame.devices = normalizeDevices(message.devices);
      frame.updatedAt = Date.now();
    }).then(() => publish(tabId)).catch(error => console.error("WebRTC Live Monitor: processing FRAME_DEVICES failed.", error));
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
