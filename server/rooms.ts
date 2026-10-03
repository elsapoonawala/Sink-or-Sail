// Room manager: owns every live GameState, runs phase timers and practice bots,
// and pushes a redacted view to each connected player after every change.
import { randomBytes, randomInt } from "node:crypto";
import {
  type GameState, type Place, type Offer,
  addPlayer, advance, cancelOffer, createGame, everyoneDone, loadCard, makeOffer, pickPlace, player,
  removePlayer, respondOffer, setDone, startGame, toggleReady, viewFor, MAX_PLAYERS,
} from "../shared/game";
import { BOT_NAMES, botAct } from "../shared/bots";
import type { ChatMessage, ClientAction, SignalKey, VoiceState } from "../shared/protocol";
import { SIGNALS } from "../shared/protocol";

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const rng = () => Math.random();

export interface Room {
  state: GameState;
  tokens: Map<string, string>;
  sockets: Map<string, string>;
  chat: ChatMessage[];
  voice: Record<string, VoiceState>;
  timer: NodeJS.Timeout | null;
  botTimers: NodeJS.Timeout[];
  lastActive: number;
  lastChat: Map<string, number[]>;
  dropTimers: Map<string, NodeJS.Timeout>;
}

export interface Transport {
  toSocket(socketId: string, event: string, data: unknown): void;
}

export class Rooms {
  rooms = new Map<string, Room>();
  constructor(private io: Transport) {
    setInterval(() => this.sweep(), 10 * 60 * 1000).unref();
  }

  private newCode(): string {
    for (;;) {
      let c = "";
      for (let i = 0; i < 4; i++) c += CODE_LETTERS[randomInt(CODE_LETTERS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  private newId() {
    return "p" + randomBytes(6).toString("hex");
  }

  create(name: string, socketId: string) {
    const code = this.newCode();
    const pid = this.newId();
    const room: Room = {
      state: createGame(code, pid),
      tokens: new Map(),
      sockets: new Map(),
      chat: [],
      voice: {},
      timer: null,
      botTimers: [],
      lastActive: Date.now(),
      lastChat: new Map(),
      dropTimers: new Map(),
    };
    this.rooms.set(code, room);
    addPlayer(room.state, pid, cleanName(name));
    const token = randomBytes(16).toString("hex");
    room.tokens.set(pid, token);
    room.sockets.set(pid, socketId);
    this.broadcast(room);
    return { code, pid, token };
  }

  join(codeRaw: string, name: string, socketId: string, pid?: string, token?: string) {
    const code = (codeRaw || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    const room = this.rooms.get(code);
    if (!room) return { error: `There's no room ${code || "with that code"}. Check the code with whoever started the game.` };
    room.lastActive = Date.now();
    // Rejoin an existing seat (refresh, phone lock, new tab).
    if (pid && token && room.tokens.get(pid) === token && player(room.state, pid)) {
      const p = player(room.state, pid)!;
      p.connected = true;
      clearTimeout(room.dropTimers.get(pid));
      room.dropTimers.delete(pid);
      room.sockets.set(pid, socketId);
      this.broadcast(room);
      this.sendExtras(room, pid);
      return { code, pid, token };
    }
    if (room.state.phase !== "lobby") return { error: "That game has already started. Ask the table to finish this round, then join from the lobby." };
    if (room.state.players.length >= MAX_PLAYERS) return { error: "That room is full (8 players)." };
    const newPid = this.newId();
    const err = addPlayer(room.state, newPid, cleanName(name));
    if (err) return { error: err };
    const newToken = randomBytes(16).toString("hex");
    room.tokens.set(newPid, newToken);
    room.sockets.set(newPid, socketId);
    this.systemChat(room, `${player(room.state, newPid)!.name} came aboard.`);
    this.broadcast(room);
    this.sendExtras(room, newPid);
    return { code, pid: newPid, token: newToken };
  }

  disconnect(code: string, pid: string, socketId: string) {
    const room = this.rooms.get(code);
    if (!room || room.sockets.get(pid) !== socketId) return;
    room.sockets.delete(pid);
    const p = player(room.state, pid);
    if (!p) return;
    p.connected = false;
    delete room.voice[pid];
    this.broadcastVoice(room);
    // Lobby seats free up if someone leaves for good; in-game seats are held.
    if (room.state.phase === "lobby") {
      room.dropTimers.set(pid, setTimeout(() => {
        if (player(room.state, pid)?.connected === false && room.state.phase === "lobby") {
          removePlayer(room.state, pid);
          room.tokens.delete(pid);
          this.broadcast(room);
        }
      }, 90_000));
    }
    this.broadcast(room);
  }

  leave(code: string, pid: string) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.sockets.delete(pid);
    delete room.voice[pid];
    if (room.state.phase === "lobby") {
      const name = player(room.state, pid)?.name;
      removePlayer(room.state, pid);
      room.tokens.delete(pid);
      if (name) this.systemChat(room, `${name} left.`);
    } else {
      const p = player(room.state, pid);
      if (p) p.connected = false;
    }
    this.broadcastVoice(room);
    this.broadcast(room);
  }

  action(code: string, pid: string, a: ClientAction): string | null {
    const room = this.rooms.get(code);
    if (!room) return "This room has closed.";
    const s = room.state;
    if (!player(s, pid)) return "You're not in this game.";
    room.lastActive = Date.now();
    const isHost = s.hostId === pid;
    let err: string | null = null;
    switch (a.type) {
      case "settings":
        if (!isHost) return "Only the host can change settings.";
        if (s.phase !== "lobby" && s.phase !== "over") return null;
        if (typeof a.quick === "boolean") s.settings.quick = a.quick;
        if (a.wrecker === "auto" || a.wrecker === "on" || a.wrecker === "off") s.settings.wrecker = a.wrecker;
        break;
      case "addBot": {
        if (!isHost) return "Only the host can add bots.";
        if (s.phase !== "lobby") return "Bots can only join in the lobby.";
        const used = new Set(s.players.map((p) => p.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Deckhand ${s.players.length + 1}`;
        err = addPlayer(s, this.newId(), name, true);
        break;
      }
      case "kick": {
        if (!isHost) return "Only the host can remove players.";
        if (s.phase !== "lobby") return "Players can only be removed in the lobby.";
        if (a.target === pid) return null;
        const sock = room.sockets.get(a.target);
        removePlayer(s, a.target);
        room.tokens.delete(a.target);
        room.sockets.delete(a.target);
        if (sock) this.io.toSocket(sock, "kicked", {});
        break;
      }
      case "start":
        if (!isHost) return "Only the host can start the game.";
        err = startGame(s, rng, Date.now());
        if (!err) this.systemChat(room, "The game has begun. Good luck, and watch the tide.");
        break;
      case "lobby":
        if (!isHost) return "Only the host can return to the lobby.";
        if (s.phase !== "over" && s.phase !== "voyage") return null;
        s.phase = "lobby";
        s.phaseEndsAt = null;
        // Drop seats of people who left during the game.
        for (const p of s.players.filter((x) => !x.connected && !x.bot)) {
          removePlayer(s, p.id);
          room.tokens.delete(p.id);
        }
        break;
      case "pick":
        err = pickPlace(s, pid, a.place as Place);
        break;
      case "done":
        err = setDone(s, pid, a.done !== false);
        break;
      case "ready":
        err = toggleReady(s, pid, a.ready);
        break;
      case "load":
        err = loadCard(s, pid, a.cardId);
        break;
      case "offer":
        err = makeOffer(s, pid, a.to, a.give as Offer["give"], a.want as Offer["want"]);
        if (!err && player(s, a.to)?.bot) this.scheduleBots(room, 1500, 3500);
        break;
      case "respond":
        err = respondOffer(s, pid, a.offerId, !!a.accept);
        break;
      case "cancel":
        err = cancelOffer(s, pid, a.offerId);
        break;
      default:
        return "Unknown action.";
    }
    if (err) return err;
    this.afterChange(room);
    return null;
  }

  chat(code: string, pid: string, textRaw: string) {
    const room = this.rooms.get(code);
    const p = room && player(room.state, pid);
    if (!room || !p) return;
    const text = String(textRaw || "").replace(/\s+/g, " ").trim().slice(0, 280);
    if (!text) return;
    if (this.rateLimited(room, pid)) return;
    this.pushChat(room, { id: randomBytes(4).toString("hex"), from: pid, text, at: Date.now() });
  }

  signal(code: string, pid: string, key: SignalKey) {
    const room = this.rooms.get(code);
    if (!room || !player(room.state, pid) || !SIGNALS.some((s) => s.key === key)) return;
    if (this.rateLimited(room, pid)) return;
    const msg = { from: pid, key, at: Date.now() };
    for (const sock of room.sockets.values()) this.io.toSocket(sock, "signal", msg);
    if (key === "ready") {
      toggleReady(room.state, pid, true);
      this.broadcast(room);
    }
  }

  voice(code: string, pid: string, v: VoiceState) {
    const room = this.rooms.get(code);
    if (!room || !player(room.state, pid)) return;
    if (v.on) room.voice[pid] = { on: true, muted: !!v.muted };
    else delete room.voice[pid];
    this.broadcastVoice(room);
  }

  rtc(code: string, from: string, to: string, data: unknown) {
    const room = this.rooms.get(code);
    if (!room || !player(room.state, from)) return;
    const sock = room.sockets.get(to);
    if (sock) this.io.toSocket(sock, "rtc", { from, data });
  }

  // ---------- internals ----------

  private rateLimited(room: Room, pid: string) {
    const now = Date.now();
    const recent = (room.lastChat.get(pid) ?? []).filter((t) => now - t < 10_000);
    recent.push(now);
    room.lastChat.set(pid, recent);
    return recent.length > 8;
  }

  private pushChat(room: Room, m: ChatMessage) {
    room.chat.push(m);
    if (room.chat.length > 100) room.chat.splice(0, room.chat.length - 100);
    for (const sock of room.sockets.values()) this.io.toSocket(sock, "chat", m);
  }

  private systemChat(room: Room, text: string) {
    this.pushChat(room, { id: randomBytes(4).toString("hex"), from: "", text, at: Date.now() });
  }

  private sendExtras(room: Room, pid: string) {
    const sock = room.sockets.get(pid);
    if (!sock) return;
    this.io.toSocket(sock, "chatHistory", room.chat);
    this.io.toSocket(sock, "voice", room.voice);
  }

  private broadcastVoice(room: Room) {
    for (const sock of room.sockets.values()) this.io.toSocket(sock, "voice", room.voice);
  }

  broadcast(room: Room) {
    for (const [pid, sock] of room.sockets) this.io.toSocket(sock, "state", { ...viewFor(room.state, pid), serverTime: Date.now() });
  }

  private lastPhaseKey = new WeakMap<Room, string>();

  /** Re-arm timers and bots after any change, and end a phase early when everyone is done. */
  private afterChange(room: Room) {
    const s = room.state;
    const key = `${s.round}:${s.tide}:${s.phase}`;
    const phaseChanged = this.lastPhaseKey.get(room) !== key;
    this.lastPhaseKey.set(room, key);

    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    if (s.phaseEndsAt) {
      const early = everyoneDone(s);
      const wait = early ? 900 : Math.max(0, s.phaseEndsAt - Date.now());
      room.timer = setTimeout(() => {
        advance(s, rng, Date.now());
        this.afterChange(room);
      }, wait);
    }
    if (phaseChanged) {
      for (const t of room.botTimers) clearTimeout(t);
      room.botTimers = [];
      const fast = s.phase === "flip" || s.phase === "reveal";
      this.scheduleBots(room, fast ? 400 : 2500, fast ? 2500 : 9000);
    }
    this.broadcast(room);
  }

  private scheduleBots(room: Room, min: number, max: number) {
    const s = room.state;
    for (const p of s.players.filter((x) => x.bot)) {
      const run = (tries: number) => {
        if (botAct(s, p.id, rng)) this.afterChange(room);
        // Keep acting (e.g. loading a second crate, answering new offers).
        if (tries > 0 && (s.phase === "load" || s.phase === "trade")) {
          room.botTimers.push(setTimeout(() => run(tries - 1), 1200 + Math.random() * 1500));
        }
      };
      room.botTimers.push(setTimeout(() => run(3), min + Math.random() * (max - min)));
    }
  }

  private sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const idle = now - room.lastActive;
      if ((room.sockets.size === 0 && idle > 30 * 60 * 1000) || idle > 6 * 60 * 60 * 1000) {
        if (room.timer) clearTimeout(room.timer);
        room.botTimers.forEach(clearTimeout);
        this.rooms.delete(code);
      }
    }
  }
}

function cleanName(raw: string): string {
  const n = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 18);
  return n || "Traveller";
}
