// Room manager: owns every live GameState, runs the world clock and practice bots,
// streams positions ten times a second and pushes a redacted view after every change.
import { randomBytes, randomInt } from "node:crypto";
import {
  type GameState, type Role,
  accuse, addPlayer, castVote, chooseRole, createGame, dive, dropItem, dump, lightLamp,
  moveTo, player, removePlayer, setReady, startGame, strike, tick, toggleMount, enterBuilding, leaveBuilding, viewFor, MAX_PLAYERS,
} from "../shared/game";
import { BOT_NAMES, type Brain, botTick, newBrain } from "../shared/bots";
import type { ChatMessage, ClientAction, PosMessage, SignalKey, VoiceState } from "../shared/protocol";
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
  brains: Map<string, Brain>;
  lastTick: number;
  sentVersion: number;
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
      brains: new Map(),
      lastTick: 0,
      sentVersion: -1,
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
      case "addBot":
      case "fill": {
        if (!isHost) return "Only the host can add bots.";
        if (s.phase !== "lobby") return "Bots can only join in the lobby.";
        const target = a.type === "fill" ? Math.max(4, s.players.length) : s.players.length + 1;
        while (s.players.length < Math.min(MAX_PLAYERS, target)) {
          const used = new Set(s.players.map((p) => p.name));
          const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Deckhand ${s.players.length + 1}`;
          err = addPlayer(s, this.newId(), name, true);
          if (err) break;
        }
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
      case "role":
        err = chooseRole(s, pid, (a.role as Role) || null);
        break;
      case "start":
        if (!isHost) return "Only the host can start the game.";
        err = startGame(s, rng, Date.now());
        if (!err && process.env.TIDE_SECONDS) {
          // Testing aid: shorter tides.
          s.tideMs = Number(process.env.TIDE_SECONDS) * 1000;
          s.endsAt = s.startedAt + s.totalTides * s.tideMs;
          s.phaseEndsAt = s.startedAt + s.tideMs;
        }
        if (!err) {
          room.brains = new Map(s.players.filter((p) => p.bot).map((p) => [p.id, newBrain()]));
          this.systemChat(room, "The tide is turning. Load enough crates onto the Kohinoor, or she sinks.");
        }
        break;
      case "lobby":
        if (!isHost) return "Only the host can return to the lobby.";
        if (s.phase !== "over" && s.phase !== "sailing") return null;
        s.phase = "lobby";
        s.phaseEndsAt = null;
        s.version++;
        // Drop seats of people who left during the game.
        for (const p of s.players.filter((x) => !x.connected && !x.bot)) {
          removePlayer(s, p.id);
          room.tokens.delete(p.id);
        }
        break;
      case "drop":
        err = dropItem(s, pid, a.itemId, Date.now());
        break;
      case "mount":
        err = toggleMount(s, pid);
        break;
      case "dive":
        err = dive(s, pid, Date.now());
        break;
      case "lamp":
        err = lightLamp(s, pid, Date.now());
        break;
      case "dump":
        err = dump(s, pid, Date.now(), rng);
        break;
      case "strike":
        err = strike(s, pid, a.target, Date.now());
        break;
      case "enter":
      case "leave": {
        err = a.type === "enter" ? enterBuilding(s, pid, Date.now()) : leaveBuilding(s, pid, Date.now());
        // A step through a door is a jump, so tell the player's device where they are now.
        const p = player(s, pid);
        const sock = room.sockets.get(pid);
        if (!err && p && sock) this.io.toSocket(sock, "snap", { x: p.x, y: p.y });
        break;
      }
      case "ready":
        err = setReady(s, pid, a.ready !== false);
        break;
      case "accuse":
        err = accuse(s, pid, a.target, Date.now());
        break;
      case "vote":
        err = castVote(s, pid, !!a.yes, Date.now());
        break;
      default:
        return "Unknown action.";
    }
    s.version++;
    this.afterChange(room);
    return err;
  }

  /** A position report from a player's device. Rejected moves snap them back. */
  move(code: string, pid: string, m: { x: number; y: number; d: number; m: boolean }) {
    const room = this.rooms.get(code);
    if (!room || room.state.phase !== "play") return;
    if (!moveTo(room.state, pid, Number(m?.x), Number(m?.y), Number(m?.d), !!m?.m, Date.now())) {
      const p = player(room.state, pid);
      const sock = room.sockets.get(pid);
      if (p && sock) this.io.toSocket(sock, "snap", { x: p.x, y: p.y });
    }
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
    room.sentVersion = room.state.version;
    for (const [pid, sock] of room.sockets) this.io.toSocket(sock, "state", { ...viewFor(room.state, pid), serverTime: Date.now() });
  }

  /** Start or stop the world clock to match the phase, and push the new view. */
  private afterChange(room: Room) {
    const live = room.state.phase === "play" || room.state.phase === "sailing";
    if (live && !room.timer) {
      room.lastTick = Date.now();
      room.timer = setInterval(() => this.step(room), 100);
    } else if (!live && room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }
    this.broadcast(room);
  }

  private step(room: Room) {
    const s = room.state;
    const now = Date.now();
    const dt = Math.min(0.25, (now - room.lastTick) / 1000);
    room.lastTick = now;
    const claimed = new Set<string>();
    for (const p of s.players) {
      if (!p.bot) continue;
      let b = room.brains.get(p.id);
      if (!b) room.brains.set(p.id, (b = newBrain()));
      botTick(s, p, b, now, dt, rng, claimed);
    }
    tick(s, now, rng);
    // Positions every frame; the full view only when something else changed.
    const pos: PosMessage = {
      t: now,
      p: s.players.map((p) => [p.id, Math.round(p.x), Math.round(p.y), Math.round(p.dir * 100), (p.moving ? 1 : 0) | (p.mounted ? 2 : 0) | (now < p.busyUntil ? 4 : 0) | (now < p.downUntil ? 8 : 0)]),
    };
    for (const sock of room.sockets.values()) this.io.toSocket(sock, "pos", pos);
    if (s.version !== room.sentVersion) this.afterChange(room);
  }

  private sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const idle = now - room.lastActive;
      if ((room.sockets.size === 0 && idle > 30 * 60 * 1000) || idle > 6 * 60 * 60 * 1000) {
        if (room.timer) clearInterval(room.timer);
        this.rooms.delete(code);
      }
    }
  }
}

function cleanName(raw: string): string {
  const n = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 18);
  return n || "Traveller";
}
