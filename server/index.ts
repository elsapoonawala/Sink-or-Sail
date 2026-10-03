import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { Rooms } from "./rooms";
import type { ClientAction, SignalKey, VoiceState } from "../shared/protocol";

const PORT = Number(process.env.PORT) || 3000;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: true }, pingInterval: 10_000, pingTimeout: 20_000 });
const rooms = new Rooms({ toSocket: (id, ev, data) => io.to(id).emit(ev, data) });

// Voice uses public STUN by default. A TURN relay (for strict networks) can be added with env vars.
function iceServers() {
  const list: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  if (process.env.TURN_URL) {
    list.push({ urls: process.env.TURN_URL.split(","), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  return list;
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, rooms: rooms.rooms.size });
});

if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: "1h", index: false }));
  app.get(/^\/(?!socket\.io).*/, (_req, res) => res.sendFile(join(dist, "index.html")));
}

io.on("connection", (socket) => {
  let code = "";
  let pid = "";
  socket.emit("ice", iceServers());

  socket.on("create", (msg: { name: string }, ack: (r: unknown) => void) => {
    if (code && pid) rooms.leave(code, pid);
    const r = rooms.create(msg?.name, socket.id);
    code = r.code;
    pid = r.pid;
    ack?.(r);
  });

  socket.on("join", (msg: { code: string; name: string; pid?: string; token?: string }, ack: (r: unknown) => void) => {
    const r = rooms.join(msg?.code, msg?.name, socket.id, msg?.pid, msg?.token);
    if (!("error" in r) || !r.error) {
      if (code && pid && (code !== r.code || pid !== r.pid)) rooms.leave(code, pid);
      code = r.code!;
      pid = r.pid!;
    }
    ack?.(r);
  });

  socket.on("leave", () => {
    if (code && pid) rooms.leave(code, pid);
    code = pid = "";
  });

  socket.on("action", (a: ClientAction, ack: (r: unknown) => void) => {
    if (!code || !pid) return ack?.({ error: "You're not in a room." });
    try {
      ack?.({ error: rooms.action(code, pid, a) });
    } catch (e) {
      console.error("action failed", a, e);
      ack?.({ error: "Something went wrong. Try again." });
    }
  });

  socket.on("chat", (text: string) => code && rooms.chat(code, pid, text));
  socket.on("signal", (key: SignalKey) => code && rooms.signal(code, pid, key));
  socket.on("voice", (v: VoiceState) => code && rooms.voice(code, pid, v));
  socket.on("rtc", (m: { to: string; data: unknown }) => code && rooms.rtc(code, pid, m?.to, m?.data));

  socket.on("disconnect", () => {
    if (code && pid) rooms.disconnect(code, pid, socket.id);
  });
});

http.listen(PORT, () => {
  console.log(`The Last Ferry is boarding on http://localhost:${PORT}`);
});
