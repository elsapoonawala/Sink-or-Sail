// Voice chat: a small WebRTC mesh (everyone connects to everyone), signalled
// through the game server. Audio only, so 8 players is comfortable.
import { useSyncExternalStore } from "react";
import { getStore, sendVoice, socket, toast } from "./net";

interface Peer {
  pc: RTCPeerConnection;
  gain?: GainNode;
  analyser?: AnalyserNode;
  el?: HTMLAudioElement;
  makingOffer: boolean;
  polite: boolean;
}

export interface VoiceUi {
  joined: boolean;
  joining: boolean;
  muted: boolean;
  hasMic: boolean;
  speaking: Record<string, boolean>;
  volume: Record<string, number>;
  blocked: Record<string, boolean>;
}

let ui: VoiceUi = { joined: false, joining: false, muted: false, hasMic: false, speaking: {}, volume: loadPrefs().volume, blocked: loadPrefs().blocked };
const subs = new Set<() => void>();
function set(p: Partial<VoiceUi>) {
  ui = { ...ui, ...p };
  subs.forEach((f) => f());
}
export function useVoice(): VoiceUi {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => ui);
}

function loadPrefs(): { volume: Record<string, number>; blocked: Record<string, boolean> } {
  try {
    return JSON.parse(localStorage.getItem("lastferry:voiceprefs") || "") || { volume: {}, blocked: {} };
  } catch {
    return { volume: {}, blocked: {} };
  }
}
function savePrefs() {
  try {
    localStorage.setItem("lastferry:voiceprefs", JSON.stringify({ volume: ui.volume, blocked: ui.blocked }));
  } catch {
    /* ignore */
  }
}

let ctx: AudioContext | null = null;
let local: MediaStream | null = null;
let localAnalyser: AnalyserNode | null = null;
const peers = new Map<string, Peer>();
let raf = 0;

function me() {
  return getStore().session?.pid ?? "";
}

/** Join voice. Walkie-talkie style: you start muted and press to talk. */
export async function joinVoice(startMuted = true) {
  if (ui.joined || ui.joining) return;
  set({ joining: true });
  try {
    ctx = ctx ?? new AudioContext();
    await ctx.resume();
  } catch {
    ctx = null;
  }
  let hasMic = false;
  try {
    local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    hasMic = true;
    if (ctx) {
      localAnalyser = ctx.createAnalyser();
      localAnalyser.fftSize = 512;
      ctx.createMediaStreamSource(local).connect(localAnalyser);
    }
  } catch {
    local = null;
    toast("No microphone available, so you'll hear everyone but can't speak. Signals and chat still work.", "alert");
  }
  const muted = !hasMic || (startMuted && !pttHeld);
  local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  set({ joined: true, joining: false, hasMic, muted });
  sendVoice({ on: true, muted });
  syncPeers();
  loop();
}

export function leaveVoice() {
  for (const id of [...peers.keys()]) closePeer(id);
  local?.getTracks().forEach((t) => t.stop());
  local = null;
  localAnalyser = null;
  cancelAnimationFrame(raf);
  set({ joined: false, muted: false, hasMic: false, speaking: {} });
  sendVoice({ on: false, muted: false });
}

let pttHeld = false;
let pttWasMuted = true;

/** Press and hold to talk; letting go mutes you again (unless you were already live). */
export function pttDown() {
  pttHeld = true;
  if (!ui.joined) {
    joinVoice(true);
    return;
  }
  pttWasMuted = ui.muted;
  if (ui.muted && ui.hasMic) setMuted(false);
}

export function pttUp() {
  if (!pttHeld) return;
  pttHeld = false;
  if (ui.joined && ui.hasMic && pttWasMuted && !ui.muted) setMuted(true);
}

function setMuted(muted: boolean) {
  local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  set({ muted });
  sendVoice({ on: true, muted });
}

/** How loud each person is right now (0 or 1), for the talking rings in the world. */
export function voiceLevel(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, on] of Object.entries(ui.speaking)) if (on) out[k] = 1;
  return out;
}

export function toggleMute() {
  if (!ui.joined) return joinVoice(false);
  if (!ui.hasMic) {
    toast("Your browser didn't share a microphone. Check its permissions, then rejoin voice.", "alert");
    return;
  }
  const muted = !ui.muted;
  local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  set({ muted });
  sendVoice({ on: true, muted });
}

export function setVolume(pid: string, v: number) {
  set({ volume: { ...ui.volume, [pid]: v } });
  applyGain(pid);
  savePrefs();
}

export function toggleBlock(pid: string) {
  set({ blocked: { ...ui.blocked, [pid]: !ui.blocked[pid] } });
  applyGain(pid);
  savePrefs();
}

function applyGain(pid: string) {
  const p = peers.get(pid);
  const v = ui.blocked[pid] ? 0 : ui.volume[pid] ?? 1;
  if (p?.gain) p.gain.gain.value = v;
  else if (p?.el) p.el.volume = Math.min(1, v);
}

/** Connect to everyone else who is in voice, and drop anyone who left. */
export function syncPeers() {
  if (!ui.joined) return;
  const voice = getStore().voice;
  const self = me();
  for (const id of Object.keys(voice)) {
    if (id === self || !voice[id].on) continue;
    if (!peers.has(id)) createPeer(id);
  }
  for (const id of [...peers.keys()]) if (!voice[id]?.on) closePeer(id);
}

function createPeer(id: string): Peer {
  const pc = new RTCPeerConnection({ iceServers: getStore().ice });
  // Exactly one side of each pair is "polite" and yields if both offer at once.
  const peer: Peer = { pc, makingOffer: false, polite: me() > id };
  peers.set(id, peer);
  if (local) for (const t of local.getAudioTracks()) pc.addTrack(t, local);
  else pc.addTransceiver("audio", { direction: "recvonly" });

  pc.onicecandidate = (e) => e.candidate && socket.emit("rtc", { to: id, data: { candidate: e.candidate } });
  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      socket.emit("rtc", { to: id, data: { sdp: pc.localDescription } });
    } catch (e) {
      console.warn("offer failed", e);
    } finally {
      peer.makingOffer = false;
    }
  };
  pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    attachAudio(id, peer, stream);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") {
      closePeer(id);
      setTimeout(syncPeers, 1500);
    }
  };
  return peer;
}

function attachAudio(id: string, peer: Peer, stream: MediaStream) {
  if (peer.el) return;
  const el = new Audio();
  el.autoplay = true;
  (el as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
  el.srcObject = stream;
  peer.el = el;
  if (ctx) {
    // Route through Web Audio for per-player volume and the speaking ring.
    // The element stays muted but attached, which keeps Chrome's stream flowing.
    el.muted = true;
    const src = ctx.createMediaStreamSource(stream);
    peer.gain = ctx.createGain();
    peer.analyser = ctx.createAnalyser();
    peer.analyser.fftSize = 512;
    src.connect(peer.analyser);
    src.connect(peer.gain).connect(ctx.destination);
  }
  el.play().catch(() => undefined);
  applyGain(id);
}

function closePeer(id: string) {
  const p = peers.get(id);
  if (!p) return;
  p.pc.close();
  p.gain?.disconnect();
  if (p.el) p.el.srcObject = null;
  peers.delete(id);
  if (ui.speaking[id]) set({ speaking: { ...ui.speaking, [id]: false } });
}

socket.on("rtc", async ({ from, data }: { from: string; data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
  if (!ui.joined) return;
  let peer = peers.get(from);
  if (!peer) peer = createPeer(from);
  const pc = peer.pc;
  try {
    if (data.sdp) {
      // "Perfect negotiation": the polite side yields when both offer at once.
      const collision = data.sdp.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
      if (collision && !peer.polite) return;
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === "offer") {
        await pc.setLocalDescription();
        socket.emit("rtc", { to: from, data: { sdp: pc.localDescription } });
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate).catch(() => undefined);
    }
  } catch (e) {
    console.warn("rtc error", e);
  }
});

socket.on("voice", () => setTimeout(syncPeers, 50));

function level(a: AnalyserNode | null | undefined): number {
  if (!a) return 0;
  const buf = new Uint8Array(a.fftSize);
  a.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

const lastLoud: Record<string, number> = {};
function loop() {
  cancelAnimationFrame(raf);
  let last = 0;
  const tick = (t: number) => {
    raf = requestAnimationFrame(tick);
    if (t - last < 90) return;
    last = t;
    const now = performance.now();
    const next: Record<string, boolean> = {};
    const check = (id: string, a: AnalyserNode | null | undefined, enabled: boolean) => {
      if (enabled && level(a) > 0.035) lastLoud[id] = now;
      next[id] = enabled && now - (lastLoud[id] ?? 0) < 350;
    };
    check(me(), localAnalyser, !ui.muted);
    const voice = getStore().voice;
    for (const [id, p] of peers) check(id, p.analyser, !voice[id]?.muted && !ui.blocked[id]);
    const changed = Object.keys(next).some((k) => next[k] !== !!ui.speaking[k]) || Object.keys(ui.speaking).some((k) => ui.speaking[k] && !next[k]);
    if (changed) set({ speaking: next });
  };
  raf = requestAnimationFrame(tick);
}

export const voiceSupported = typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
