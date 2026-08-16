(() => {
  "use strict";
  if (window.__webRTCLiveMonitorInstalled) return;
  Object.defineProperty(window, "__webRTCLiveMonitorInstalled", { value: true });

  const NativePC = window.RTCPeerConnection;
  const peers = new Set();
  const previousStats = new WeakMap();
  const screenShareTracks = new WeakSet();
  const localDeviceTracks = new Set();
  let updatePending = false;
  let measurementRunning = false;

  async function emit() {
    if (measurementRunning) {
      updatePending = true;
      return;
    }
    measurementRunning = true;
    updatePending = false;
    try {
      const counts = await WebRTCMonitorRtpStats.countPeerConnections(peers, previousStats, screenShareTracks);
      window.postMessage({ source: "webrtc-live-monitor", version: 2, type: "COUNTS", counts }, "*");
    } finally {
      measurementRunning = false;
      if (updatePending) queueMicrotask(emit);
    }
  }

  function update() {
    if (measurementRunning) updatePending = true;
    else if (!updatePending) {
      updatePending = true;
      queueMicrotask(emit);
    }
  }

  function observeTrack(track) {
    if (track && typeof track.addEventListener === "function") track.addEventListener("ended", update);
  }

  async function emitDevices() {
    const mediaDevices = window.navigator?.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.enumerateDevices !== "function") return;
    try {
      const available = (await mediaDevices.enumerateDevices()).map(device => ({
        kind: device.kind,
        label: device.label
      }));
      const used = [...localDeviceTracks]
        .filter(track => track.readyState !== "ended")
        .map(track => ({
          kind: track.kind === "audio" ? "audioinput" : "videoinput",
          label: track.label || ""
        }));
      window.postMessage({ source: "webrtc-live-monitor", version: 2, type: "DEVICES", devices: { available, used } }, "*");
    } catch {
      // Device enumeration can be denied by a document's Permissions Policy.
    }
  }

  function observeLocalDeviceTrack(track) {
    if (!track) return;
    localDeviceTracks.add(track);
    if (typeof track.addEventListener === "function") {
      track.addEventListener("ended", () => {
        localDeviceTracks.delete(track);
        void emitDevices();
      }, { once: true });
    }
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

  if (typeof NativePC === "function") {
    function InstrumentedRTCPeerConnection(...args) {
      if (!new.target) return Reflect.apply(NativePC, this, args);
      const pc = Reflect.construct(NativePC, args, new.target);
      observe(pc);
      return pc;
    }
    Object.setPrototypeOf(InstrumentedRTCPeerConnection, NativePC);
    InstrumentedRTCPeerConnection.prototype = NativePC.prototype;
    Object.defineProperty(window, "RTCPeerConnection", { configurable: true, writable: true, value: InstrumentedRTCPeerConnection });
  }

  const mediaDevices = window.navigator?.mediaDevices;
  const nativeGetUserMedia = mediaDevices?.getUserMedia;
  if (typeof nativeGetUserMedia === "function") {
    Object.defineProperty(mediaDevices, "getUserMedia", {
      configurable: true,
      writable: true,
      value: async function (...args) {
        const stream = await Reflect.apply(nativeGetUserMedia, this, args);
        for (const track of stream.getTracks()) observeLocalDeviceTrack(track);
        await emitDevices();
        return stream;
      }
    });
  }
  if (mediaDevices && typeof mediaDevices.addEventListener === "function") {
    mediaDevices.addEventListener("devicechange", emitDevices);
  }
  const nativeGetDisplayMedia = mediaDevices?.getDisplayMedia;
  if (typeof nativeGetDisplayMedia === "function") {
    Object.defineProperty(mediaDevices, "getDisplayMedia", {
      configurable: true,
      writable: true,
      value: async function (...args) {
        const stream = await Reflect.apply(nativeGetDisplayMedia, this, args);
        for (const track of stream.getVideoTracks()) screenShareTracks.add(track);
        return stream;
      }
    });
  }

  const nativeReplaceTrack = window.RTCRtpSender && window.RTCRtpSender.prototype.replaceTrack;
  if (typeof nativeReplaceTrack === "function" && !nativeReplaceTrack.__webRTCLiveMonitorWrapped) {
    function replaceTrack(...args) {
      const result = Reflect.apply(nativeReplaceTrack, this, args);
      return Promise.resolve(result).then(value => { observeTrack(this.track); update(); return value; });
    }
    Object.defineProperty(replaceTrack, "__webRTCLiveMonitorWrapped", { value: true });
    Object.defineProperty(window.RTCRtpSender.prototype, "replaceTrack", { configurable: true, writable: true, value: replaceTrack });
  }

  window.addEventListener("pagehide", () => window.postMessage({ source: "webrtc-live-monitor", version: 2, type: "FRAME_GONE" }, "*"));
  setInterval(update, 2500);
  update();
  void emitDevices();
})();
