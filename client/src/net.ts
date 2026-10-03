// Connection to the game server and a tiny store the UI subscribes to.
import { io, type Socket } from "socket.io-client";
import { useSyncExternalStore } from "react";
import type { GameView } from "../../shared/game";
import type { ChatMessage, ClientAction, JoinResult, PosMessage, SignalKey, SignalMessage, VoiceState } from "../../shared/protocol";

export interface Session {
  code: string;
  pid: string;
  token: string;
  name: string;
}

export interface Store {
  connected: boolean;
  session: Session | null;
  view: GameView | null;
  chat: ChatMessage[];
  signals: SignalMessage[];
  voice: Record<string, VoiceState>;
  ice: RTCIceServer[];
  toast: { id: number; text: string; tone: "info" | "error" | "alert" } | null;
  unread: number;
  /** serverTime - localTime, so countdowns agree across devices. */
  clockOffset: number;
}

const SESSION_KEY = "lastferry:session";

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage can be unavailable in private windows */
  }
}

export function savedName(): string {
  try {
    return localStorage.getItem("lastferry:name") ?? "";
  } catch {
    return "";
  }
}

let state: Store = {
  connected: false,
  session: null,
  view: null,
  chat: [],
  signals: [],
  voice: {},
  ice: [{ urls: "stun:stun.l.google.com:19302" }],
  toast: null,
  unread: 0,
  clockOffset: 0,
};
const listeners = new Set<() => void>();
function set(patch: Partial<Store>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function useStore(): Store {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
export const getStore = () => state;

export const socket: Socket = io({ transports: ["websocket", "polling"] });

let chatOpen = false;
export function setChatOpen(open: boolean) {
  chatOpen = open;
  if (open) set({ unread: 0 });
}

let toastN = 0;
export function toast(text: string, tone: "info" | "error" | "alert" = "info") {
  const id = ++toastN;
  set({ toast: { id, text, tone } });
  setTimeout(() => {
    if (state.toast?.id === id) set({ toast: null });
  }, tone === "error" ? 4200 : 3200);
}

socket.on("connect", () => {
  set({ connected: true });
  // Reattach to our seat after a reconnect (phone lock, network blip).
  const s = state.session;
  if (s) socket.emit("join", { code: s.code, name: s.name, pid: s.pid, token: s.token }, (r: JoinResult) => {
    if (r.error) {
      saveSession(null);
      set({ session: null, view: null });
      toast(r.error, "error");
    }
  });
});
socket.on("disconnect", () => set({ connected: false }));
socket.on("state", (view: GameView) => set({ view, clockOffset: view.serverTime ? view.serverTime - Date.now() : state.clockOffset }));
socket.on("ice", (ice: RTCIceServer[]) => set({ ice }));
socket.on("chatHistory", (chat: ChatMessage[]) => set({ chat }));
socket.on("chat", (m: ChatMessage) => set({ chat: [...state.chat.slice(-99), m], unread: chatOpen || !m.from ? state.unread : state.unread + 1 }));
socket.on("signal", (m: SignalMessage) => {
  set({ signals: [...state.signals.slice(-30), m] });
});
socket.on("voice", (voice: Record<string, VoiceState>) => set({ voice }));
socket.on("kicked", () => {
  saveSession(null);
  set({ session: null, view: null, chat: [] });
  toast("The host removed you from the room.", "alert");
  history.replaceState(null, "", "/");
});

function remember(r: JoinResult, name: string) {
  if (!r.code || !r.pid || !r.token) return;
  const session = { code: r.code, pid: r.pid, token: r.token, name };
  saveSession(session);
  try {
    localStorage.setItem("lastferry:name", name);
  } catch {
    /* ignore */
  }
  set({ session });
  history.replaceState(null, "", `/r/${r.code}`);
}

export function createRoom(name: string): Promise<JoinResult> {
  return new Promise((resolve) => {
    socket.emit("create", { name }, (r: JoinResult) => {
      remember(r, name);
      resolve(r);
    });
  });
}

export function joinRoom(code: string, name: string): Promise<JoinResult> {
  const prior = loadSession();
  const same = prior && prior.code === code.toUpperCase();
  return new Promise((resolve) => {
    socket.emit("join", { code, name, pid: same ? prior.pid : undefined, token: same ? prior.token : undefined }, (r: JoinResult) => {
      if (!r.error) remember(r, name);
      resolve(r);
    });
  });
}

export function leaveRoom() {
  socket.emit("leave");
  saveSession(null);
  set({ session: null, view: null, chat: [], signals: [], voice: {} });
  history.replaceState(null, "", "/");
}

export function act(a: ClientAction): Promise<string | null> {
  return new Promise((resolve) => {
    socket.emit("action", a, (r: { error?: string | null }) => {
      if (r?.error) toast(r.error, "error");
      resolve(r?.error ?? null);
    });
  });
}

/** Live positions, updated ten times a second outside React so the canvas can read them every frame. */
export const live = {
  pos: new Map<string, { x: number; y: number; dir: number; flags: number }>(),
  at: 0,
  snap: null as null | { x: number; y: number },
};
socket.on("pos", (m: PosMessage) => {
  for (const [id, x, y, d, f] of m.p) live.pos.set(id, { x, y, dir: d / 100, flags: f });
  live.at = m.t;
});
socket.on("snap", (p: { x: number; y: number }) => {
  live.snap = p;
});
export const sendMove = (x: number, y: number, d: number, m: boolean) => socket.volatile.emit("move", { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, d: Math.round(d * 100) / 100, m });

export const sendChat = (text: string) => socket.emit("chat", text);
export const sendSignal = (key: SignalKey) => socket.emit("signal", key);
export const sendVoice = (v: VoiceState) => socket.emit("voice", v);

/** Try to resume a saved seat for the room in the URL (or the last room). */
export function bootSession(): Session | null {
  const s = loadSession();
  const m = location.pathname.match(/^\/r\/([A-Za-z]{4})/);
  if (s && (!m || m[1].toUpperCase() === s.code)) {
    set({ session: s });
    if (socket.connected) socket.emit("join", { code: s.code, name: s.name, pid: s.pid, token: s.token }, (r: JoinResult) => {
      if (r.error) {
        saveSession(null);
        set({ session: null });
      }
    });
    return s;
  }
  return null;
}

export function urlCode(): string {
  const m = location.pathname.match(/^\/r\/([A-Za-z]{4})/);
  return m ? m[1].toUpperCase() : "";
}
