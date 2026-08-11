const peers = [];
const result = document.getElementById("result");
const makeTrack = kind => {
  const context = new AudioContext();
  const stream = kind === "audio" ? context.createMediaStreamDestination().stream : document.createElement("canvas").captureStream(1);
  const track = stream.getTracks()[0];
  track._context = context;
  return track;
};
function addPeer() { const pc = new RTCPeerConnection(); peers.push(pc); return pc; }
async function addIncoming() {
  const sender = addPeer(), receiver = addPeer();
  sender.addTrack(makeTrack("audio"));
  sender.onicecandidate = e => e.candidate && receiver.addIceCandidate(e.candidate);
  receiver.onicecandidate = e => e.candidate && sender.addIceCandidate(e.candidate);
  const offer = await sender.createOffer(); await sender.setLocalDescription(offer); await receiver.setRemoteDescription(offer);
  const answer = await receiver.createAnswer(); await receiver.setLocalDescription(answer); await sender.setRemoteDescription(answer);
}
const actions = {
  "1 Keine Peer Connection": () => closeAll(),
  "2 Offene Peer Connection ohne Tracks": () => addPeer(),
  "3 Ausgehender Audiotrack": () => addPeer().addTrack(makeTrack("audio")),
  "4 Audio und Video": () => { const pc=addPeer(); pc.addTrack(makeTrack("audio")); pc.addTrack(makeTrack("video")); },
  "5 Mehrere Peer Connections": () => { addPeer(); addPeer(); },
  "6 Eingehender Audiotrack (lokaler Loopback)": () => addIncoming(),
  "7 replaceTrack": async () => { const pc=addPeer(); const sender=pc.addTrack(makeTrack("audio")); await sender.replaceTrack(makeTrack("audio")); },
  "8 Track beenden/entfernen": () => { const pc=addPeer(); const sender=pc.addTrack(makeTrack("audio")); pc.removeTrack(sender); sender.track?.stop(); },
  "9 Peer Connection schließen": () => addPeer().close(),
  "11 Seite neu laden": () => location.reload(),
  "12 Separaten Tab öffnen": () => window.open(location.href, "_blank")
};
function closeAll(){ for(const pc of peers) pc.close(); peers.length=0; }
for(const [label, action] of Object.entries(actions)){ const b=document.createElement("button"); b.textContent=label; b.onclick=async()=>{await action();result.textContent=`Ausgeführt: ${label}`}; controls.append(b); }
