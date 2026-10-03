// The living island: a canvas with the camera following you, free movement with
// keys, a floating joystick, tap-to-walk or click-to-walk, and everyone else in real time.

import { useEffect, useRef } from "react";
import { type GameView, type PlayerView, carryLimit, speedOf } from "../../shared/game";
import { SIGNALS } from "../../shared/protocol";
import { FERRY, GANGWAY, H, W, ZONES, ZONE_IDS, footing, seaLevel, swimming, tideLevel } from "../../shared/world";
import { getStore, live, sendMove } from "./net";
import {
  type Prop, drawCrate, drawDock, drawFerry, drawGangway, drawGlints, drawItem, drawLandmarks, drawPearls, drawPerson,
  drawProp, drawRoads, paintTerrain, paintWater, scatterProps,
} from "./scene";
import { sfx } from "./sound";
import { voiceLevel } from "./voice";

interface Smooth {
  x: number;
  y: number;
  dir: number;
  moving: boolean;
  mounted: boolean;
  busy: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  ring?: boolean;
}

export interface WorldApi {
  /** Steer from an on-screen joystick: x/y in -1..1. */
  setStick(x: number, y: number): void;
  /** Where the local player is right now. */
  me(): { x: number; y: number };
}

export function World({ v, onTapPlayer, api }: { v: GameView; onTapPlayer: (pid: string) => void; api: React.MutableRefObject<WorldApi | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(v);
  viewRef.current = v;
  const tapRef = useRef(onTapPlayer);
  tapRef.current = onTapPlayer;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const marks = Array.from({ length: viewRef.current.totalTides - 1 }, (_, i) => tideLevel(i + 2, viewRef.current.totalTides));
    const terrain = paintTerrain(marks);
    const water = document.createElement("canvas");
    let waterLevel = -99;
    let waterPainted = 0;
    const props: Prop[] = scatterProps();

    const startMe = viewRef.current.players.find((p) => p.id === viewRef.current.you);
    const me = { x: startMe?.x ?? 1250, y: startMe?.y ?? 1300, dir: startMe?.dir ?? 0, moving: false };
    const cam = { x: me.x, y: me.y };
    const others = new Map<string, Smooth>();
    const keys = new Set<string>();
    const stick = { x: 0, y: 0 };
    let target: { x: number; y: number } | null = null;
    let lastSent = 0;
    let sentMoving = false;
    let lastFx = Math.max(0, ...viewRef.current.fx.map((f) => f.n));
    const particles: Particle[] = [];
    let raf = 0;
    let prev = performance.now();
    let vw = 0;
    let vh = 0;
    let dpr = 1;
    let scale = 1;

    api.current = {
      setStick(x, y) {
        stick.x = x;
        stick.y = y;
        if (x || y) target = null;
      },
      me: () => ({ x: me.x, y: me.y }),
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      vw = r.width;
      vh = r.height;
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      scale = Math.max(0.62, Math.min(1.5, Math.min(vw, vh) / 560));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const toWorld = (sx: number, sy: number) => ({ x: (sx - vw / 2) / scale + cam.x, y: (sy - vh / 2) / scale + cam.y });

    // ---- input ----
    const typing = () => {
      const el = document.activeElement;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    };
    const onKey = (e: KeyboardEvent) => {
      if (typing()) return;
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        if (e.type === "keydown") {
          keys.add(k);
          target = null;
        } else keys.delete(k);
        e.preventDefault();
      }
    };
    const clearKeys = () => keys.clear();
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", clearKeys);

    let down: { x: number; y: number; t: number; id: number; mouse: boolean } | null = null;
    const pick = (sx: number, sy: number): string | null => {
      const w = toWorld(sx, sy);
      let best: string | null = null;
      let bestD = 34;
      for (const p of viewRef.current.players) {
        const o = p.id === viewRef.current.you ? me : others.get(p.id);
        if (!o) continue;
        const d = Math.hypot(w.x - o.x, w.y + 22 - o.y);
        if (d < bestD) {
          bestD = d;
          best = p.id;
        }
      }
      return best;
    };
    const onDown = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      down = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now(), id: e.pointerId, mouse: e.pointerType === "mouse" };
      canvas.setPointerCapture(e.pointerId);
      if (down.mouse && e.button === 0 && !pick(down.x, down.y)) target = toWorld(down.x, down.y);
    };
    const onMove = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (down.mouse) {
        if (e.buttons & 1) target = toWorld(x, y);
        return;
      }
      // Touch: drag anywhere for a floating joystick.
      const dx = x - down.x;
      const dy = y - down.y;
      const len = Math.hypot(dx, dy);
      if (len > 10) {
        const m = Math.min(1, len / 60);
        stick.x = (dx / len) * m;
        stick.y = (dy / len) * m;
        target = null;
        joy = { ox: down.x, oy: down.y, x, y };
      }
    };
    let joy: { ox: number; oy: number; x: number; y: number } | null = null;
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const quick = performance.now() - down.t < 300 && Math.hypot(x - down.x, y - down.y) < 12;
      if (quick) {
        const pid = pick(x, y);
        if (pid) tapRef.current(pid);
        else if (!down.mouse) target = toWorld(x, y);
      }
      if (!down.mouse) {
        stick.x = 0;
        stick.y = 0;
        joy = null;
      }
      down = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    const noMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener("contextmenu", noMenu);

    // ---- frame ----
    const frame = (nowP: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (nowP - prev) / 1000);
      prev = nowP;
      const v = viewRef.current;
      const { clockOffset, chat, signals } = getStore();
      const now = Date.now() + clockOffset;
      const t = nowP;
      const level = v.phase === "lobby" ? 0 : seaLevel(v.tide, v.tideStartedAt, v.totalTides, now);
      const g = { level, secretFound: v.secretFound, caveOpen: v.caveOpen };
      if (Math.abs(level - waterLevel) > 0.012 && nowP - waterPainted > 110) {
        paintWater(water, level);
        waterLevel = level;
        waterPainted = nowP;
      }
      const self = v.players.find((p) => p.id === v.you);

      // Local movement, predicted here and confirmed by the server.
      if (live.snap) {
        me.x = live.snap.x;
        me.y = live.snap.y;
        live.snap = null;
        target = null;
      }
      let ix = 0;
      let iy = 0;
      if (keys.has("arrowleft") || keys.has("a")) ix -= 1;
      if (keys.has("arrowright") || keys.has("d")) ix += 1;
      if (keys.has("arrowup") || keys.has("w")) iy -= 1;
      if (keys.has("arrowdown") || keys.has("s")) iy += 1;
      if (!ix && !iy && (stick.x || stick.y)) {
        ix = stick.x;
        iy = stick.y;
      }
      if (!ix && !iy && target) {
        const dx = target.x - me.x;
        const dy = target.y - me.y;
        const d = Math.hypot(dx, dy);
        if (d < 6) target = null;
        else {
          ix = dx / d;
          iy = dy / d;
        }
      }
      const canMove = self && v.phase === "play" && !self.brig && now >= self.busyUntil;
      const mag = Math.min(1, Math.hypot(ix, iy));
      let moving = false;
      if (canMove && mag > 0.05) {
        const len = Math.hypot(ix, iy);
        const speed = speedOf(self) * mag * Math.max(0.3, footing(me.x, me.y, g) || 0.3);
        const nx = me.x + (ix / len) * speed * dt;
        const ny = me.y + (iy / len) * speed * dt;
        me.dir = Math.atan2(iy, ix);
        if (footing(nx, ny, g) > 0) {
          me.x = nx;
          me.y = ny;
          moving = true;
        } else if (footing(nx, me.y, g) > 0) {
          me.x = nx;
          moving = true;
        } else if (footing(me.x, ny, g) > 0) {
          me.y = ny;
          moving = true;
        } else target = null;
      }
      // If the tide or the server moved us, follow the server.
      const srv = live.pos.get(v.you);
      if (srv && (!canMove || Math.hypot(srv.x - me.x, srv.y - me.y) > 160)) {
        me.x += (srv.x - me.x) * Math.min(1, dt * 10);
        me.y += (srv.y - me.y) * Math.min(1, dt * 10);
      }
      me.moving = moving;
      if (canMove && (nowP - lastSent > 80) && (moving || sentMoving)) {
        sendMove(me.x, me.y, me.dir, moving);
        lastSent = nowP;
        sentMoving = moving;
      }

      // Everyone else glides towards their latest reported position.
      for (const p of v.players) {
        if (p.id === v.you) continue;
        const l = live.pos.get(p.id);
        const tx = l?.x ?? p.x;
        const ty = l?.y ?? p.y;
        let o = others.get(p.id);
        if (!o) {
          o = { x: tx, y: ty, dir: p.dir, moving: false, mounted: p.mounted, busy: false };
          others.set(p.id, o);
        }
        const k = Math.min(1, dt * 9);
        if (Math.hypot(tx - o.x, ty - o.y) > 300) {
          o.x = tx;
          o.y = ty;
        } else {
          o.x += (tx - o.x) * k;
          o.y += (ty - o.y) * k;
        }
        o.dir = l ? l.dir : p.dir;
        o.moving = l ? (l.flags & 1) === 1 : p.moving;
        o.mounted = l ? (l.flags & 2) === 2 : p.mounted;
        o.busy = l ? (l.flags & 4) === 4 : now < p.busyUntil;
      }

      // Camera eases after you, staying over the island.
      const sail = v.phase === "sailing" || v.phase === "over" ? Math.min(900, Math.max(0, (now - ((v.phaseEndsAt ?? now) - 7000)) / 7000) * 900) : 0;
      const focus = v.phase === "sailing" || v.phase === "over" ? { x: FERRY.x + sail * 0.6, y: FERRY.y - 60 } : me;
      cam.x += (focus.x - cam.x) * Math.min(1, dt * 4);
      cam.y += (focus.y - cam.y) * Math.min(1, dt * 4);
      const halfW = vw / 2 / scale;
      const halfH = vh / 2 / scale;
      cam.x = Math.max(halfW - 200, Math.min(W + 200 - halfW, cam.x));
      cam.y = Math.max(halfH - 200, Math.min(H + 200 - halfH, cam.y));

      // New world events become sounds and sparkles.
      for (const f of v.fx) {
        if (f.n <= lastFx) continue;
        lastFx = f.n;
        const near = Math.hypot(f.x - me.x, f.y - me.y) < 700 || f.by === v.you;
        const burst = (color: string, n: number, ring = false) => {
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 30 + Math.random() * 70;
            particles.push({ x: f.x, y: f.y - 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0, max: 0.6 + Math.random() * 0.5, color, size: 2 + Math.random() * 2.5, ring });
          }
          if (ring) particles.push({ x: f.x, y: f.y, vx: 0, vy: 0, life: 0, max: 1.1, color, size: 6, ring: true });
        };
        switch (f.kind) {
          case "pickup": burst("#fff3b0", 10); if (f.by === v.you) sfx.pearl(); break;
          case "load": burst("#f2d14b", 16, true); if (near) sfx.thud(); break;
          case "splash": burst("#d8f6f2", 22, true); if (near) sfx.flood(); break;
          case "dive": burst("#bff2ea", 14, true); if (near) sfx.deal(); break;
          case "lamp": burst("#fff3b0", 30, true); sfx.flip(); break;
          case "gate": burst("#9fd6ee", 30, true); sfx.win(); break;
          case "sink": burst("#bff2ea", 6, true); break;
          case "swept": if (f.by === v.you) sfx.alert(); burst("#ffffff", 10, true); break;
          case "barter": burst("#f2d14b", 12); if (near) sfx.trade(); break;
          case "trade": burst("#e7849a", 12); if (near) sfx.trade(); break;
          case "horse": if (near) sfx.click(); break;
          case "tide": sfx.flood(); break;
          case "brig": sfx.alert(); break;
        }
      }

      // ---- draw ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0e4a5e";
      ctx.fillRect(0, 0, vw, vh);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (vw / 2 - cam.x * scale), dpr * (vh / 2 - cam.y * scale));
      const x0 = cam.x - halfW - 80;
      const x1 = cam.x + halfW + 80;
      const y0 = cam.y - halfH - 80;
      const y1 = cam.y + halfH + 160;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(terrain, 0, 0, W, H);
      drawRoads(ctx, v.secretFound, t);
      ctx.drawImage(water, 0, 0, W, H);
      drawGlints(ctx, x0, y0, x1, y1, level, t);
      drawDock(ctx);
      drawFerry(ctx, t, Math.min(1, v.slots / v.capacity), sail, v.supplies.fuel >= v.needs.fuel && v.supplies.medicine >= v.needs.medicine && v.supplies.tools >= v.needs.tools);
      if (v.phase === "play") drawGangway(ctx, t, !!self?.carry.length);

      const items: { y: number; draw: () => void }[] = [];
      for (const p of props) if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1 && level - 0.25 < 99 && footing(p.x, p.y, g) > 0.6) items.push({ y: p.y, draw: () => drawProp(ctx, p, t) });
      for (const l of drawLandmarks(ctx, t, now < v.lampUntil, v.caveOpen, level)) items.push(l);
      for (const c of v.crates) if (c.x > x0 && c.x < x1 && c.y > y0 && c.y < y1) items.push({ y: c.y, draw: () => drawCrate(ctx, c.kind, c.x, c.y, t, c.x * 0.01) });
      for (const pile of v.piles) if (pile.x > x0 && pile.x < x1) items.push({ y: pile.y, draw: () => drawPearls(ctx, pile.x, pile.y, pile.n, t) });
      const bodies: { p: PlayerView; s: Smooth }[] = [];
      for (const p of v.players) {
        if (v.phase !== "play" && v.phase !== "lobby") break;
        const s: Smooth = p.id === v.you ? { ...me, mounted: self?.mounted ?? false, busy: now < (self?.busyUntil ?? 0) } : others.get(p.id)!;
        if (!s || p.brig) continue;
        bodies.push({ p, s });
        items.push({ y: s.y, draw: () => drawPerson(ctx, { ...s, role: p.role, seat: p.seat, swim: swimming(s.x, s.y, g) }, t + p.seat * 137) });
      }
      items.sort((a, b) => a.y - b.y);
      for (const it of items) it.draw();

      // Name tags, carried cargo, speech and the "talking" ring.
      const vl = voiceLevel();
      ctx.textAlign = "center";
      for (const { p, s } of bodies) {
        const swim = !s.mounted && swimming(s.x, s.y, g);
        const top = s.y - (s.mounted ? 92 : swim ? 34 : 62);
        const isMe = p.id === v.you;
        const talking = vl[p.id] ?? 0;
        if (talking > 0) {
          ctx.strokeStyle = `rgba(127,224,210,${0.5 + talking * 0.5})`;
          ctx.lineWidth = 2;
          for (let i = 0; i < 2; i++) {
            const rr = 8 + i * 6 + ((t / 90) % 6);
            ctx.beginPath();
            ctx.arc(s.x + 16, top - 2, rr, -0.7, 0.7);
            ctx.stroke();
          }
        }
        ctx.font = `${isMe ? 700 : 600} 12px "Courier Prime", monospace`;
        const label = isMe ? "You" : p.name;
        const tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = isMe ? "rgba(210,167,78,.92)" : "rgba(11,42,51,.78)";
        roundRect(ctx, s.x - tw / 2, top - 9, tw, 16, 8);
        ctx.fill();
        ctx.fillStyle = isMe ? "#1d1410" : "#f3ece0";
        ctx.fillText(label, s.x, top + 3);
        if (p.ready) {
          ctx.fillStyle = "#7fcf8f";
          ctx.beginPath();
          ctx.arc(s.x + tw / 2 + 4, top - 1, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        // carried crates stacked on the shoulder
        p.carry.forEach((c, i) => drawItem(ctx, c.kind, s.x - 14 + (i % 2) * 10, s.y - (s.mounted ? 66 : swim ? 10 : 36) - Math.floor(i / 2) * 10 + i * 0.5, 12, t));
        // recent chat or signal as a speech bubble
        const said = [...chat].reverse().find((m) => m.from === p.id && Date.now() - m.at < 5000);
        const sig = [...signals].reverse().find((m) => m.from === p.id && Date.now() - m.at < 4000);
        const text = said && (!sig || said.at > sig.at) ? said.text : sig ? SIGNALS.find((x) => x.key === sig.key)?.label : null;
        if (text) bubble(ctx, s.x, top - 14, text.length > 42 ? `${text.slice(0, 40)}…` : text);
      }

      // Sparkles.
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.life += dt;
        if (pt.life > pt.max) {
          particles.splice(i, 1);
          continue;
        }
        const a = 1 - pt.life / pt.max;
        if (pt.ring && !pt.vx && !pt.vy) {
          ctx.strokeStyle = pt.color;
          ctx.globalAlpha = a;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(pt.x, pt.y, 8 + pt.life * 60, 3 + pt.life * 22, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.vy += 120 * dt;
          ctx.fillStyle = pt.color;
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Walk target marker.
      if (target) {
        ctx.strokeStyle = "rgba(242,209,75,.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(target.x, target.y, 10 + Math.sin(t / 150) * 2, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Place names float over the land.
      ctx.font = "italic 700 15px Georgia, serif";
      for (const id of ZONE_IDS) {
        const z = ZONES[id];
        if (z.x < x0 || z.x > x1 || z.y < y0 || z.y > y1) continue;
        const flooded = level > -99 && footing(z.x, z.y, g) === 0 && id !== "caves";
        ctx.fillStyle = flooded ? "rgba(220,245,240,.55)" : "rgba(255,248,230,.92)";
        ctx.strokeStyle = "rgba(20,30,30,.55)";
        ctx.lineWidth = 3;
        const ly = id === "palace" ? z.y - 170 : id === "hotel" ? z.y - 150 : id === "lighthouse" ? z.y - 130 : z.y - z.r * 0.55;
        ctx.strokeText(flooded ? `${z.name} (flooded)` : z.name, z.x, ly);
        ctx.fillText(flooded ? `${z.name} (flooded)` : z.name, z.x, ly);
      }

      // ---- screen space: arrow to the ferry, joystick ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (v.phase === "play" && self) {
        const tx = GANGWAY.x;
        const ty = GANGWAY.y;
        const sx = (tx - cam.x) * scale + vw / 2;
        const sy = (ty - cam.y) * scale + vh / 2;
        const off = sx < 20 || sy < 20 || sx > vw - 20 || sy > vh - 20;
        if (off && (self.carry.length || v.tide >= v.totalTides || v.sailAt)) {
          const a = Math.atan2(sy - vh / 2, sx - vw / 2);
          const rx = vw / 2 - 46;
          const ry = vh / 2 - 46;
          const k = Math.min(Math.abs(rx / Math.cos(a)), Math.abs(ry / Math.sin(a)));
          const ax = vw / 2 + Math.cos(a) * k;
          const ay = vh / 2 + Math.sin(a) * k;
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(a);
          ctx.fillStyle = "rgba(210,167,78,.95)";
          ctx.beginPath();
          ctx.moveTo(18, 0);
          ctx.lineTo(-8, -12);
          ctx.lineTo(-3, 0);
          ctx.lineTo(-8, 12);
          ctx.fill();
          ctx.restore();
          ctx.font = "700 11px 'Courier Prime', monospace";
          ctx.fillStyle = "#f3ece0";
          ctx.textAlign = "center";
          ctx.fillText(self.carry.length >= carryLimit(self) ? "Ferry (hands full)" : "Ferry", ax - Math.cos(a) * 26, ay - Math.sin(a) * 26 + 4);
        }
      }
      // Glinting pointers to the nearest crates you can't see yet.
      if (v.phase === "play" && self && self.carry.length < carryLimit(self)) {
        const near = v.crates
          .filter((c) => (c.zone !== "cave" || v.caveOpen) && footing(c.x, c.y, g) > 0)
          .map((c) => ({ c, d: Math.hypot(c.x - me.x, c.y - me.y) }))
          .filter(({ c }) => {
            const sx = (c.x - cam.x) * scale + vw / 2;
            const sy = (c.y - cam.y) * scale + vh / 2;
            return sx < 0 || sy < 0 || sx > vw || sy > vh;
          })
          .sort((a, b) => a.d - b.d)
          .slice(0, 2);
        for (const { c, d } of near) {
          const a = Math.atan2(c.y - me.y, c.x - me.x);
          const rx = vw / 2 - 30;
          const ry = vh / 2 - 30;
          const k = Math.min(Math.abs(rx / Math.cos(a)), Math.abs(ry / Math.sin(a)));
          const ax = vw / 2 + Math.cos(a) * k * 0.92;
          const ay = vh / 2 + Math.sin(a) * k * 0.92;
          ctx.save();
          ctx.globalAlpha = Math.max(0.45, 1 - d / 2200);
          ctx.fillStyle = "rgba(8,30,37,.7)";
          ctx.beginPath();
          ctx.arc(ax, ay, 15, 0, Math.PI * 2);
          ctx.fill();
          drawItem(ctx, c.kind, ax, ay, 16, t);
          ctx.translate(ax + Math.cos(a) * 19, ay + Math.sin(a) * 19);
          ctx.rotate(a);
          ctx.fillStyle = "#f2d14b";
          ctx.beginPath();
          ctx.moveTo(6, 0);
          ctx.lineTo(-3, -5);
          ctx.lineTo(-3, 5);
          ctx.fill();
          ctx.restore();
        }
      }
      if (joy) {
        ctx.fillStyle = "rgba(11,42,51,.35)";
        ctx.strokeStyle = "rgba(210,167,78,.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(joy.ox, joy.oy, 60, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const kx = joy.ox + stick.x * 60;
        const ky = joy.oy + stick.y * 60;
        ctx.fillStyle = "rgba(210,167,78,.9)";
        ctx.beginPath();
        ctx.arc(kx, ky, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", clearKeys);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("contextmenu", noMenu);
      api.current = null;
    };
    // The world is built once per game; live data is read from refs every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.round, v.totalTides]);

  return <canvas ref={canvasRef} className="world" aria-label="The island. Use arrow keys or WASD, click or tap to walk, or drag to steer." />;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.font = "600 12px 'Courier Prime', monospace";
  const w = ctx.measureText(text).width + 16;
  ctx.fillStyle = "rgba(248,241,223,.96)";
  roundRect(ctx, x - w / 2, y - 22, w, 20, 8);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 3);
  ctx.lineTo(x, y + 4);
  ctx.lineTo(x + 5, y - 3);
  ctx.fill();
  ctx.fillStyle = "#1d1410";
  ctx.fillText(text, x, y - 8);
}

/** A small map of the whole island for the corner of the screen. */
export function MiniMap({ v, size = 150 }: { v: GameView; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(v);
  viewRef.current = v;
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const marks: number[] = [];
    const terrain = paintTerrain(marks);
    const water = document.createElement("canvas");
    let lvl = -99;
    const hgt = Math.round((size * H) / W);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = hgt * dpr;
    const draw = () => {
      const v = viewRef.current;
      const now = Date.now() + getStore().clockOffset;
      const level = seaLevel(v.tide, v.tideStartedAt, v.totalTides, now);
      if (Math.abs(level - lvl) > 0.05) {
        paintWater(water, level);
        lvl = level;
      }
      const k = size / W;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0e4a5e";
      ctx.fillRect(0, 0, size, hgt);
      ctx.drawImage(terrain, 0, 0, size, hgt);
      ctx.drawImage(water, 0, 0, size, hgt);
      const me = v.players.find((p) => p.id === v.you);
      const lamp = now < v.lampUntil;
      for (const cr of v.crates) {
        const show = lamp || (me?.role === "physician" && cr.kind === "medicine");
        if (!show) continue;
        ctx.fillStyle = cr.kind === "medicine" ? "#ff8f9c" : cr.kind === "diamond" || cr.kind === "compass" ? "#bfe8f5" : "#f2d14b";
        ctx.fillRect(cr.x * k - 1.5, cr.y * k - 1.5, 3, 3);
      }
      // ferry
      ctx.fillStyle = "#f3ece0";
      ctx.fillRect((FERRY.x - 150) * k, (FERRY.y - 10) * k, 300 * k, 18 * k);
      for (const p of v.players) {
        const l = live.pos.get(p.id);
        const x = (l?.x ?? p.x) * k;
        const y = (l?.y ?? p.y) * k;
        if (p.brig) continue;
        ctx.fillStyle = p.id === v.you ? "#f2d14b" : p.bot ? "#cfc4b0" : "#7fe0d2";
        ctx.beginPath();
        ctx.arc(x, y, p.id === v.you ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
        if (p.id === v.you) {
          ctx.strokeStyle = "#1d1410";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    };
    draw();
    const iv = setInterval(draw, 300);
    return () => clearInterval(iv);
  }, [size]);
  return <canvas ref={ref} className="minimap" style={{ width: size, height: Math.round((size * H) / W) }} aria-label="Map of the island" />;
}
