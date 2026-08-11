(() => {
  "use strict";
  if (window.__webRTCLiveMonitorInstalled) return;
  Object.defineProperty(window, "__webRTCLiveMonitorInstalled", { value: true });

  const NativePC = window.RTCPeerConnection;
  if (typeof NativePC !== "function") return;
  const peers = new Set();
  const trackIds = new WeakMap();
  let nextTrackId = 1;
  let scheduled = false;

  function trackKey(track) {
    if (!trackIds.has(track)) trackIds.set(track, nextTrackId++);
    return trackIds.get(track);
  }

  function snapshot() {
    return WebRTCMonitorPeerCounting.countPeerConnections(peers, trackKey);
  }

  function emit() {
    scheduled = false;
    window.postMessage({ source: "webrtc-live-monitor", version: 1, type: "COUNTS", counts: snapshot() }, "*");
  }

  function update() {
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(emit);
    }
  }

  function observeTrack(track) {
    if (track && typeof track.addEventListener === "function") track.addEventListener("ended", update);
  }

  function wrapMethod(pc, name, after) {
    const original = pc[name];
    if (typeof original !== "function") return;
    Object.defineProperty(pc, name, {
      configurable: true,
      writable: true,
      value: function (...args) {
        const result = Reflect.apply(original, this, args);
        after(args, result);
        return result;
      }
    });
  }

  function observe(pc) {
    peers.add(pc);
    pc.addEventListener("connectionstatechange", update);
    pc.addEventListener("track", event => { observeTrack(event.track); update(); });
    wrapMethod(pc, "addTrack", (args, sender) => { observeTrack(args[0]); observeTrack(sender && sender.track); update(); });
    wrapMethod(pc, "removeTrack", () => update());
    wrapMethod(pc, "addTransceiver", (args, transceiver) => {
      observeTrack(args[0] && typeof args[0] === "object" ? args[0] : null);
      observeTrack(transceiver && transceiver.sender && transceiver.sender.track);
      observeTrack(transceiver && transceiver.receiver && transceiver.receiver.track);
      update();
    });
    wrapMethod(pc, "close", () => update());
    update();
  }

  function InstrumentedRTCPeerConnection(...args) {
    if (!new.target) return Reflect.apply(NativePC, this, args);
    const pc = Reflect.construct(NativePC, args, new.target);
    observe(pc);
    return pc;
  }
  Object.setPrototypeOf(InstrumentedRTCPeerConnection, NativePC);
  InstrumentedRTCPeerConnection.prototype = NativePC.prototype;
  Object.defineProperty(window, "RTCPeerConnection", { configurable: true, writable: true, value: InstrumentedRTCPeerConnection });

  const nativeReplaceTrack = window.RTCRtpSender && window.RTCRtpSender.prototype.replaceTrack;
  if (typeof nativeReplaceTrack === "function" && !nativeReplaceTrack.__webRTCLiveMonitorWrapped) {
    function replaceTrack(...args) {
      const result = Reflect.apply(nativeReplaceTrack, this, args);
      return Promise.resolve(result).then(value => { observeTrack(this.track); update(); return value; });
    }
    Object.defineProperty(replaceTrack, "__webRTCLiveMonitorWrapped", { value: true });
    Object.defineProperty(window.RTCRtpSender.prototype, "replaceTrack", { configurable: true, writable: true, value: replaceTrack });
  }

  window.addEventListener("pagehide", () => window.postMessage({ source: "webrtc-live-monitor", version: 1, type: "FRAME_GONE" }, "*"));
  setInterval(update, 2500);
  update();
})();
