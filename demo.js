"use strict";
const peers = [];
const resources = [];
const result = document.getElementById("result");

function createPeer() {
  const peer = new RTCPeerConnection();
  peers.push(peer);
  return peer;
}

function createAudioTrack() {
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  resources.push(context);
  return destination.stream.getAudioTracks()[0];
}

function createVideoTrack() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  context.fillStyle = "#54a7ff";
  context.fillRect(0, 0, 16, 16);
  const stream = canvas.captureStream(1);
  resources.push(...stream.getTracks());
  return stream.getVideoTracks()[0];
}

function addTrack(kind) {
  const peer = peers.find(item => item.connectionState !== "closed") || createPeer();
  peer.addTrack(kind === "audio" ? createAudioTrack() : createVideoTrack());
  result.textContent = `${kind === "audio" ? "Audio" : "Video"}-Track hinzugefügt. Öffne jetzt das Popup.`;
}

document.getElementById("empty").addEventListener("click", () => {
  createPeer();
  result.textContent = "Offene Peer Connection ohne Tracks erstellt. Öffne jetzt das Popup.";
});
document.getElementById("audio").addEventListener("click", () => addTrack("audio"));
document.getElementById("video").addEventListener("click", () => addTrack("video"));
document.getElementById("close").addEventListener("click", async () => {
  for (const peer of peers) peer.close();
  for (const resource of resources) {
    if (typeof resource.stop === "function") resource.stop();
    if (typeof resource.close === "function") await resource.close();
  }
  peers.length = 0;
  resources.length = 0;
  result.textContent = "Alle Testverbindungen und Tracks wurden geschlossen.";
});
