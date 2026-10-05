// The front page backdrop: the real island at golden hour, with the camera drifting over
// the harbour and islanders going about their business.
import { useEffect, useRef } from "react";
import type { Kind, Role } from "../../shared/game";
import { H, S, W, ZONES, type ZoneId, findPath } from "../../shared/world";
import {
  type Prop, drawCrate, drawDock, drawFerry, drawGlints, drawItem, drawLandmarks, drawPerson, drawProp, drawRoads,
  paintTerrain, paintWater, scatterProps, seaColor,
} from "./scene";

interface Walker {
  role: Role;
  seat: number;
  mounted: boolean;
  carry: Kind[];
  route: ZoneId[];
  path: { x: number; y: number }[];
  leg: number;
  x: number;
  y: number;
  dir: number;
  speed: number;
}

const CAST: Omit<Walker, "path" | "leg" | "x" | "y" | "dir">[] = [
  { role: "cartographer", seat: 3, mounted: true, carry: [], route: ["harbour", "stables", "palace", "market"], speed: 120 },
  { role: "duchess", seat: 2, mounted: true, carry: ["diamond"], route: ["palace", "gardens", "stables", "harbour"], speed: 105 },
  { role: "engineer", seat: 1, mounted: false, carry: ["fuel", "tools"], route: ["market", "harbour", "stables"], speed: 60 },
  { role: "diver", seat: 0, mounted: false, carry: ["medicine"], route: ["coves", "harbour", "shipwreck"], speed: 55 },
  { role: "physician", seat: 4, mounted: false, carry: [], route: ["stables", "market", "harbour"], speed: 58 },
  { role: "jeweler", seat: 5, mounted: false, carry: ["fuel"], route: ["harbour", "palace", "stables"], speed: 52 },
];

const SCENERY_CRATES = ([
  { kind: "fuel", x: 1080, y: 1210 }, { kind: "medicine", x: 1400, y: 1180 }, { kind: "tools", x: 900, y: 1010 },
  { kind: "diamond", x: 1300, y: 760 }, { kind: "fuel", x: 1640, y: 1110 }, { kind: "cutlass", x: 760, y: 1180 },
  { kind: "medicine", x: 1010, y: 760 }, { kind: "tools", x: 1500, y: 1290 },
] as { kind: Kind; x: number; y: number }[]).map((c) => ({ ...c, x: c.x * S, y: c.y * S }));

export function HomeScene() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const terrain = paintTerrain([]);
    const water = document.createElement("canvas");
    paintWater(water, 0);
    const props: Prop[] = scatterProps();
    const g = { level: 0, secretFound: false, caveOpen: false };
    const walkers: Walker[] = CAST.map((c, i) => {
      const from = ZONES[c.route[0]];
      return { ...c, path: [], leg: 0, x: from.x + i * 7, y: from.y + 20, dir: 0 };
    });
    const nextLeg = (w: Walker) => {
      w.leg = (w.leg + 1) % w.route.length;
      const to = ZONES[w.route[w.leg]];
      w.path = findPath(w.x, w.y, to.x + (Math.random() - 0.5) * 60, to.y + 30, g) ?? [];
    };
    walkers.forEach(nextLeg);

    let vw = 0;
    let vh = 0;
    let dpr = 1;
    // Resizing a canvas wipes it, so only do it when the size really changed, and only from
    // inside the draw loop: a resize between a draw and the screen update shows a blank
    // frame, which flickers on phones whose toolbars slide in and out.
    let sizeDirty = true;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      vw = r.width;
      vh = r.height;
      const cw = Math.round(vw * dpr);
      const ch = Math.round(vh * dpr);
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;
    };
    resize();
    const ro = new ResizeObserver(() => {
      sizeDirty = true;
    });
    ro.observe(canvas);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let prev = performance.now();
    const t0 = prev;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (sizeDirty) {
        sizeDirty = false;
        resize();
      }
      const t = still ? 0 : now - t0;
      const scale = Math.max(0.5, Math.min(1, Math.max(vw / 1700, vh / 1150)));
      // A slow drift over the harbour, the stables and the palace hill.
      const a = t / 26000;
      const cx = Math.max(vw / 2 / scale, Math.min(W - vw / 2 / scale, 1250 * S + Math.sin(a) * 360));
      const cy = Math.max(vh / 2 / scale, Math.min(H + 120 - vh / 2 / scale, 1180 * S + Math.sin(a * 0.7 + 1) * 120));

      for (const w of walkers) {
        if (still) break;
        const p = w.path[0];
        if (!p) {
          nextLeg(w);
          continue;
        }
        const dx = p.x - w.x;
        const dy = p.y - w.y;
        const d = Math.hypot(dx, dy);
        const step = w.speed * dt;
        w.dir = Math.atan2(dy, dx);
        if (d <= step) {
          w.x = p.x;
          w.y = p.y;
          w.path.shift();
        } else {
          w.x += (dx / d) * step;
          w.y += (dy / d) * step;
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = seaColor(0);
      ctx.fillRect(0, 0, vw, vh);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (vw / 2 - cx * scale), dpr * (vh / 2 - cy * scale));
      const x0 = cx - vw / 2 / scale - 80;
      const x1 = cx + vw / 2 / scale + 80;
      const y0 = cy - vh / 2 / scale - 80;
      const y1 = cy + vh / 2 / scale + 160;
      ctx.drawImage(terrain, 0, 0, W, H);
      drawRoads(ctx, false, t);
      ctx.drawImage(water, 0, 0, W, H);
      drawGlints(ctx, x0, y0, x1, y1, 0, t);
      drawDock(ctx);
      drawFerry(ctx, t, 0.55, 0, false);
      const items: { y: number; draw: () => void }[] = [];
      for (const p of props) if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) items.push({ y: p.y, draw: () => drawProp(ctx, p, t) });
      for (const l of drawLandmarks(ctx, t, true, false, 0)) items.push(l);
      for (const c of SCENERY_CRATES) items.push({ y: c.y, draw: () => drawCrate(ctx, c.kind, c.x, c.y, t, c.x * 0.01) });
      for (const w of walkers) {
        items.push({
          y: w.y,
          draw: () => {
            drawPerson(ctx, { x: w.x, y: w.y, dir: w.dir, moving: !still, mounted: w.mounted, role: w.role, seat: w.seat, busy: false }, t + w.seat * 137);
            w.carry.forEach((k, i) => drawItem(ctx, k, w.x - 14 + i * 10, w.y - (w.mounted ? 66 : 36), 12, t));
          },
        });
      }
      items.sort((p, q) => p.y - q.y);
      for (const it of items) it.draw();

      // Golden hour: warm the whole scene and darken the edges.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "soft-light";
      const warm = ctx.createLinearGradient(0, 0, 0, vh);
      warm.addColorStop(0, "rgba(255,170,90,.75)");
      warm.addColorStop(0.6, "rgba(255,140,110,.35)");
      warm.addColorStop(1, "rgba(60,40,90,.5)");
      ctx.fillStyle = warm;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "rgba(255,196,150,.55)";
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);
  return <canvas ref={ref} className="home-scene" aria-hidden="true" />;
}
