// Canvas painting for the open world: terrain, rising water, buildings, people and horses.
// Everything is drawn in world units; the caller sets the camera transform.

import type { Kind, Role } from "../../shared/game";
import {
  CAVE, CAVE_DOOR, DIVE_SPOTS, DOCK, FERRY, GANGWAY, H, LAMP, LANDING, MARKET_STALL, SECRET_PATH, STABLE_POS, W, elev,
} from "../../shared/world";

export const RES = 3; // world units per terrain pixel
const TW = Math.ceil(W / RES);
const TH = Math.ceil(H / RES);

export const SKIN = ["#f1c9a5", "#c98e62", "#8d5a3b", "#e8b48c", "#5e3a24", "#f6d7bd", "#b27a50", "#a8693f"];
export const HAIR = ["#2b1d14", "#6b3d1f", "#111111", "#b98a4a", "#3a2a22", "#8a8a8a", "#1d1410", "#a0522d"];
export const SEAT_COLORS = ["#3fc1b5", "#d2a74e", "#e7849a", "#9fd6ee", "#c9b6e4", "#ef8f6b", "#7fcf8f", "#f1ead9"];

export const ROLE_LOOK: Record<Role, { coat: string; trim: string; hat: "scarf" | "goggles" | "tophat" | "tricorn" | "bowler" | "tiara"; cape?: string }> = {
  diver: { coat: "#1f8f8a", trim: "#bff2ea", hat: "scarf" },
  engineer: { coat: "#8a2f2a", trim: "#d2a74e", hat: "goggles" },
  physician: { coat: "#5b4a3a", trim: "#e8e1cf", hat: "tophat", cape: "#3b2f25" },
  cartographer: { coat: "#4a2f7a", trim: "#d2a74e", hat: "tricorn", cape: "#2a1a48" },
  jeweler: { coat: "#1f4e79", trim: "#b8434f", hat: "bowler" },
  duchess: { coat: "#1e7a4f", trim: "#f3ece0", hat: "tiara", cape: "#0f4d31" },
};

const HORSE_COATS = ["#7a4a2a", "#f1ead9", "#2b211c", "#a8693f", "#5e3a24", "#cfc4b0", "#3a2a22", "#8a5a3a"];

function mix(a: number[], b: number[], t: number) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Elevation bands painted like an old illuminated map.
const BANDS: [number, number[]][] = [
  [-2.2, [22, 84, 104]],
  [-0.8, [56, 150, 150]],
  [-0.15, [214, 201, 160]],
  [0.25, [238, 220, 170]],
  [0.6, [168, 196, 110]],
  [1.4, [128, 182, 92]],
  [2.4, [104, 160, 80]],
  [3.4, [88, 142, 72]],
  [4.6, [104, 136, 78]],
  [6.0, [150, 140, 112]],
  [7.6, [196, 186, 160]],
  [9.0, [232, 224, 204]],
];

function bandColor(e: number) {
  if (e <= BANDS[0][0]) return BANDS[0][1];
  for (let i = 1; i < BANDS.length; i++) {
    if (e < BANDS[i][0]) {
      const [e0, c0] = BANDS[i - 1];
      const [e1, c1] = BANDS[i];
      return mix(c0, c1, (e - e0) / (e1 - e0));
    }
  }
  return BANDS[BANDS.length - 1][1];
}

let heights: Float32Array | null = null;
function heightField() {
  if (!heights) {
    heights = new Float32Array(TW * TH);
    for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) heights[j * TW + i] = elev(i * RES, j * RES);
  }
  return heights;
}

/** The land, with hill shading and faint tide marks, painted once. */
export function paintTerrain(tideMarks: number[]): HTMLCanvasElement {
  const hf = heightField();
  const c = document.createElement("canvas");
  c.width = TW;
  c.height = TH;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(TW, TH);
  const d = img.data;
  for (let j = 0; j < TH; j++) {
    for (let i = 0; i < TW; i++) {
      const k = j * TW + i;
      const e = hf[k];
      const ex = hf[j * TW + Math.min(TW - 1, i + 1)] - hf[j * TW + Math.max(0, i - 1)];
      const ey = hf[Math.min(TH - 1, j + 1) * TW + i] - hf[Math.max(0, j - 1) * TW + i];
      // Light from the upper left.
      const shade = Math.max(0.62, Math.min(1.28, 1 - (ex * 0.9 + ey * 0.9) * (e > 0 ? 1.4 : 0.5)));
      let col = bandColor(e);
      // Speckle so grass and sand read as texture, not flat fill.
      const n = ((Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1 + 1) % 1;
      const grain = 1 + (n - 0.5) * (e > 0.6 ? 0.1 : 0.06);
      col = col.map((v) => v * shade * grain);
      // Tide marks: dotted lines where each future tide will reach.
      for (const m of tideMarks) {
        if (Math.abs(e - m) < 0.035 && (i + j) % 4 < 2) col = mix(col, [70, 60, 40], 0.35);
      }
      d[k * 4] = col[0];
      d[k * 4 + 1] = col[1];
      d[k * 4 + 2] = col[2];
      d[k * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Water over everything below the current sea level, repainted as the tide rises. */
export function paintWater(target: HTMLCanvasElement, level: number) {
  const hf = heightField();
  target.width = TW;
  target.height = TH;
  const ctx = target.getContext("2d")!;
  const img = ctx.createImageData(TW, TH);
  const d = img.data;
  for (let k = 0; k < hf.length; k++) {
    const depth = level - hf[k];
    if (depth <= -0.06) continue;
    let r, g, b, a;
    if (depth < 0.02) {
      // foam at the waterline
      r = 240; g = 252; b = 246; a = 200;
    } else {
      const t = Math.min(1, depth / 4.2);
      const shallow = [96, 214, 200];
      const deep = [14, 72, 96];
      const c = mix(shallow, deep, Math.pow(t, 0.7));
      r = c[0]; g = c[1]; b = c[2];
      a = Math.min(240, 105 + depth * 70);
    }
    d[k * 4] = r;
    d[k * 4 + 1] = g;
    d[k * 4 + 2] = b;
    d[k * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
}

/** The colour of open sea at the current level, matching the painted water, for beyond the map's edge. */
export function seaColor(level: number) {
  const depth = level + 2.2;
  const t = Math.min(1, depth / 4.2);
  const c = mix([96, 214, 200], [14, 72, 96], Math.pow(t, 0.7));
  const a = Math.min(240, 105 + depth * 70) / 255;
  const bed = BANDS[0][1];
  return `rgb(${Math.round(c[0] * a + bed[0] * (1 - a))},${Math.round(c[1] * a + bed[1] * (1 - a))},${Math.round(c[2] * a + bed[2] * (1 - a))})`;
}

// ---------- scenery ----------

export interface Prop {
  kind: "palm" | "cypress" | "lemon" | "rock" | "flower" | "house";
  x: number;
  y: number;
  s: number;
  v: number;
}

/** Trees, rocks and cottages scattered deterministically across the island. */
export function scatterProps(): Prop[] {
  const out: Prop[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const keepClear = [
    { x: 1200, y: 610, r: 150 }, { x: 1760, y: 450, r: 120 }, { x: 1770, y: 1045, r: 90 }, { x: 2200, y: 790, r: 50 },
    { x: 960, y: 865, r: 80 }, { x: 600, y: 1310, r: 110 }, { x: CAVE.x, y: CAVE.y + 10, r: 110 }, { x: 1250, y: 1330, r: 70 },
  ];
  for (let n = 0; n < 900 && out.length < 270; n++) {
    const x = 120 + rnd() * (W - 240);
    const y = 120 + rnd() * (H - 240);
    const e = elev(x, y);
    if (e < 0.35) continue;
    if (keepClear.some((k) => Math.hypot(x - k.x, y - k.y) < k.r)) continue;
    if (Math.abs(x - 1225 - ((y - 700) / 692) * 45) < 40 && y > 680 && y < 1400) continue; // causeway
    const r = rnd();
    let kind: Prop["kind"];
    if (e < 1.6) kind = r < 0.55 ? "palm" : r < 0.75 ? "flower" : r < 0.85 ? "rock" : "palm";
    else if (e < 3.6) kind = r < 0.35 ? "cypress" : r < 0.6 ? "lemon" : r < 0.75 ? "flower" : "palm";
    else kind = r < 0.5 ? "cypress" : r < 0.75 ? "rock" : "flower";
    out.push({ kind, x, y, s: 0.8 + rnd() * 0.5, v: rnd() });
  }
  // Harbour cottages either side of the causeway.
  const houses = [[1100, 1250], [1150, 1215], [1330, 1240], [1380, 1290], [1090, 1330], [1360, 1345], [1175, 1355]];
  for (const [x, y] of houses) out.push({ kind: "house", x, y, s: 1, v: (x * 7 + y) % 5 / 5 });
  return out;
}

export function drawProp(ctx: CanvasRenderingContext2D, p: Prop, t: number) {
  const { x, y, s } = p;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  shadow(ctx, 0, 0, p.kind === "house" ? 30 : 12, 5);
  switch (p.kind) {
    case "palm": {
      const sway = Math.sin(t / 900 + p.v * 6) * 2;
      ctx.strokeStyle = "#8a6440";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(4, -20, sway + 2, -40);
      ctx.stroke();
      ctx.fillStyle = p.v > 0.5 ? "#3f8f4a" : "#4a9a52";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + p.v;
        ctx.beginPath();
        ctx.ellipse(sway + 2 + Math.cos(a) * 11, -40 + Math.sin(a) * 5, 13, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#6b4a2f";
      ctx.beginPath();
      ctx.arc(sway + 2, -39, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "cypress":
      ctx.fillStyle = "#2f5e3a";
      ctx.beginPath();
      ctx.ellipse(0, -26, 8, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3d7448";
      ctx.beginPath();
      ctx.ellipse(-2, -30, 4, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "lemon":
      ctx.fillStyle = "#6b4a2f";
      ctx.fillRect(-2, -12, 4, 12);
      ctx.fillStyle = "#4f8f45";
      ctx.beginPath();
      ctx.arc(0, -20, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f2d14b";
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(Math.cos(i * 1.7 + p.v) * 8, -20 + Math.sin(i * 2.3) * 7, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "rock":
      ctx.fillStyle = "#9b9183";
      ctx.beginPath();
      ctx.ellipse(0, -5, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b9b0a2";
      ctx.beginPath();
      ctx.ellipse(-3, -8, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "flower": {
      const cols = ["#e7849a", "#f2d14b", "#f3ece0", "#c9b6e4"];
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = cols[(i + Math.floor(p.v * 4)) % 4];
        ctx.beginPath();
        ctx.arc(Math.cos(i * 2.4) * 7, -2 + Math.sin(i * 2.4) * 4, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "house": {
      const walls = ["#f3e6cf", "#f2d7c4", "#e3eef0", "#f6e3b3", "#e9d2e6"][Math.floor(p.v * 5)];
      ctx.fillStyle = walls;
      ctx.fillRect(-22, -30, 44, 30);
      ctx.fillStyle = "#b5523b";
      ctx.beginPath();
      ctx.moveTo(-26, -30);
      ctx.lineTo(0, -46);
      ctx.lineTo(26, -30);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#2b5a6a";
      ctx.fillRect(-14, -22, 8, 9);
      ctx.fillRect(6, -22, 8, 9);
      ctx.fillStyle = "#6b4a2f";
      ctx.fillRect(-4, -14, 8, 14);
      break;
    }
  }
  ctx.restore();
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = "rgba(20,30,20,.22)";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- roads ----------

export function drawRoads(ctx: CanvasRenderingContext2D, secret: boolean, t: number) {
  const roads: [number, number, number, number, number][] = [
    [1205, 700, 1250, 1392, 22],
    [1300, 610, 1660, 495, 16],
    [1100, 610, 720, 500, 16],
    [1195, 520, 1185, 300, 18],
    [1960, 860, 2190, 806, 14],
  ];
  ctx.lineCap = "round";
  for (const [x1, y1, x2, y2, w] of roads) {
    ctx.strokeStyle = "rgba(90,70,45,.35)";
    ctx.lineWidth = w + 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = "#d9c49a";
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.setLineDash([3, 9]);
    ctx.lineWidth = w * 0.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // The hidden stepping stones glint once someone finds them.
  const s = SECRET_PATH;
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const x = s.x1 + ((s.x2 - s.x1) * i) / n;
    const y = s.y1 + ((s.y2 - s.y1) * i) / n;
    ctx.fillStyle = secret ? "#cfc4b0" : "rgba(200,240,235,.12)";
    ctx.beginPath();
    ctx.ellipse(x + Math.sin(i * 2.1) * 4, y, 9, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    if (secret) {
      ctx.fillStyle = `rgba(255,240,190,${0.25 + 0.25 * Math.sin(t / 300 + i)})`;
      ctx.beginPath();
      ctx.arc(x + Math.sin(i * 2.1) * 4, y - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------- the pier and the ferry ----------

export function drawDock(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(10,40,50,.3)";
  ctx.fillRect(DOCK.x1 + 4, DOCK.y1 + 6, DOCK.x2 - DOCK.x1, DOCK.y2 - DOCK.y1);
  ctx.fillRect(LANDING.x1 + 4, LANDING.y1 + 6, LANDING.x2 - LANDING.x1, LANDING.y2 - LANDING.y1);
  const plank = (x1: number, y1: number, x2: number, y2: number, horizontal: boolean) => {
    ctx.fillStyle = "#a07850";
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.strokeStyle = "#7a5634";
    ctx.lineWidth = 1.5;
    if (horizontal) for (let y = y1; y < y2; y += 8) { ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); }
    else for (let x = x1; x < x2; x += 8) { ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke(); }
  };
  plank(DOCK.x1, DOCK.y1, DOCK.x2, DOCK.y2, true);
  plank(LANDING.x1, LANDING.y1, LANDING.x2, LANDING.y2, false);
  // Bollards and lanterns.
  ctx.fillStyle = "#3a2a22";
  for (const [x, y] of [[DOCK.x1 + 4, DOCK.y1 + 30], [DOCK.x2 - 4, DOCK.y1 + 30], [DOCK.x1 + 4, DOCK.y1 + 80], [DOCK.x2 - 4, DOCK.y1 + 80], [LANDING.x1 + 6, LANDING.y1 + 6], [LANDING.x2 - 6, LANDING.y1 + 6]]) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawFerry(ctx: CanvasRenderingContext2D, t: number, fill: number, sailOffset: number, ready: boolean) {
  const x = FERRY.x + sailOffset;
  const y = FERRY.y + Math.sin(t / 700) * 1.5;
  ctx.save();
  ctx.translate(x, y);
  // wake
  if (sailOffset > 0) {
    ctx.strokeStyle = "rgba(255,255,255,.5)";
    ctx.lineWidth = 3;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-170 - i * 30, 26 + i * 4);
      ctx.lineTo(-150 - i * 30, 30 + i * 4);
      ctx.stroke();
    }
  }
  ctx.fillStyle = "rgba(5,30,40,.35)";
  ctx.beginPath();
  ctx.ellipse(6, 34, 175, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  // hull
  ctx.fillStyle = "#1d2b33";
  ctx.beginPath();
  ctx.moveTo(-170, 0);
  ctx.lineTo(160, 0);
  ctx.quadraticCurveTo(190, 2, 196, -8);
  ctx.lineTo(176, 30);
  ctx.lineTo(-156, 30);
  ctx.quadraticCurveTo(-172, 22, -170, 0);
  ctx.fill();
  ctx.fillStyle = "#b8434f";
  ctx.fillRect(-160, 22, 330, 6);
  ctx.fillStyle = "#d2a74e";
  ctx.fillRect(-168, -2, 350, 4);
  // portholes
  ctx.fillStyle = "#f3d27a";
  for (let i = -140; i < 160; i += 26) {
    ctx.beginPath();
    ctx.arc(i, 11, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // deck house
  ctx.fillStyle = "#f3ece0";
  ctx.fillRect(-120, -42, 190, 40);
  ctx.fillStyle = "#e1d6bf";
  ctx.fillRect(-90, -64, 120, 22);
  ctx.fillStyle = "#2b5a6a";
  for (let i = -112; i < 66; i += 18) ctx.fillRect(i, -34, 10, 12);
  for (let i = -82; i < 26; i += 16) ctx.fillRect(i, -58, 9, 9);
  // funnel with smoke
  ctx.fillStyle = "#b8434f";
  ctx.fillRect(-30, -102, 26, 40);
  ctx.fillStyle = "#1d2b33";
  ctx.fillRect(-30, -106, 26, 8);
  ctx.fillStyle = "#d2a74e";
  ctx.fillRect(-30, -86, 26, 4);
  for (let i = 0; i < 5; i++) {
    const age = ((t / 1400 + i / 5) % 1);
    ctx.fillStyle = `rgba(230,230,225,${0.45 * (1 - age)})`;
    ctx.beginPath();
    ctx.arc(-17 - age * 60, -112 - age * 50, 8 + age * 16, 0, Math.PI * 2);
    ctx.fill();
  }
  // cargo crates stacked on the fore deck, showing how full the hold is
  const rows = Math.round(fill * 12);
  for (let i = 0; i < rows; i++) {
    const cx = 86 + (i % 4) * 16;
    const cy = -14 - Math.floor(i / 4) * 12;
    ctx.fillStyle = "#b08050";
    ctx.fillRect(cx, cy, 14, 11);
    ctx.strokeStyle = "#6b4a2f";
    ctx.strokeRect(cx, cy, 14, 11);
  }
  // mast and pennant
  ctx.strokeStyle = "#3a2a22";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(110, -2);
  ctx.lineTo(110, -90);
  ctx.stroke();
  ctx.fillStyle = ready ? "#7fcf8f" : "#d2a74e";
  ctx.beginPath();
  ctx.moveTo(110, -90);
  ctx.lineTo(140 + Math.sin(t / 200) * 4, -84);
  ctx.lineTo(110, -78);
  ctx.fill();
  ctx.fillStyle = "#f3ece0";
  ctx.font = "italic 700 13px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("The Kohinoor", 0, 22);
  ctx.restore();
}

export function drawGangway(ctx: CanvasRenderingContext2D, t: number, active: boolean) {
  ctx.save();
  ctx.translate(GANGWAY.x, GANGWAY.y);
  const pulse = 0.5 + 0.5 * Math.sin(t / 300);
  ctx.strokeStyle = `rgba(242,209,75,${active ? 0.5 + pulse * 0.5 : 0.35})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.lineDashOffset = -t / 40;
  ctx.beginPath();
  ctx.arc(0, 0, GANGWAY.r - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#8a6440";
  ctx.fillRect(-12, 10, 24, 62);
  ctx.strokeStyle = "#5e4228";
  for (let y = 14; y < 72; y += 6) {
    ctx.beginPath();
    ctx.moveTo(-12, y);
    ctx.lineTo(12, y);
    ctx.stroke();
  }
  if (active) {
    // A sign over the gangway so nobody has to guess where cargo goes.
    const bob = Math.sin(t / 250) * 4;
    ctx.translate(0, -GANGWAY.r - 34 + bob);
    ctx.fillStyle = "rgba(20,34,40,.88)";
    ctx.strokeStyle = "#f2d14b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-62, -16, 124, 30, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f2d14b";
    ctx.font = "700 14px 'Courier Prime', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("LOAD HERE", 0, 0);
    ctx.beginPath();
    ctx.moveTo(-9, 16);
    ctx.lineTo(9, 16);
    ctx.lineTo(0, 28);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- landmarks ----------

export function drawLandmarks(ctx: CanvasRenderingContext2D, t: number, lampLit: boolean, caveOpen: boolean, level: number) {
  const out: { y: number; draw: () => void }[] = [];
  out.push({ y: 660, draw: () => palace(ctx, t) });
  out.push({ y: 500, draw: () => hotel(ctx) });
  out.push({ y: MARKET_STALL.y + 10, draw: () => market(ctx) });
  out.push({ y: LAMP.y + 20, draw: () => lighthouse(ctx, t, lampLit) });
  out.push({ y: STABLE_POS.y - 10, draw: () => stables(ctx, t) });
  out.push({ y: 470, draw: () => gazebo(ctx) });
  out.push({ y: 1330, draw: () => wreck(ctx, level) });
  out.push({ y: CAVE_DOOR.y, draw: () => cave(ctx, caveOpen) });
  for (const [i, d] of DIVE_SPOTS.entries()) out.push({ y: d.y, draw: () => buoy(ctx, d.x, d.y, t, i) });
  return out;
}

function palace(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save();
  ctx.translate(1200, 640);
  shadow(ctx, 0, 6, 120, 18);
  // terrace
  ctx.fillStyle = "#e8dcc2";
  ctx.fillRect(-120, -20, 240, 26);
  ctx.fillStyle = "#cdbd9c";
  ctx.fillRect(-120, 0, 240, 6);
  // main block
  ctx.fillStyle = "#f6eedc";
  ctx.fillRect(-90, -92, 180, 72);
  ctx.fillStyle = "#e9dcc0";
  ctx.fillRect(-90, -30, 180, 10);
  // arches
  ctx.fillStyle = "#3d6b78";
  for (let i = -75; i <= 60; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, -24);
    ctx.lineTo(i, -48);
    ctx.arc(i + 7, -48, 7, Math.PI, 0);
    ctx.lineTo(i + 14, -24);
    ctx.fill();
  }
  // towers and domes
  for (const x of [-100, 100]) {
    ctx.fillStyle = "#f3e8d0";
    ctx.fillRect(x - 16, -118, 32, 98);
    ctx.fillStyle = "#2f8f86";
    ctx.beginPath();
    ctx.arc(x, -118, 18, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#d2a74e";
    ctx.fillRect(x - 1.5, -146, 3, 12);
  }
  ctx.fillStyle = "#2f8f86";
  ctx.beginPath();
  ctx.ellipse(0, -96, 46, 40, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.25)";
  ctx.beginPath();
  ctx.ellipse(-14, -110, 10, 18, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d2a74e";
  ctx.fillRect(-2, -150, 4, 18);
  // banner
  ctx.fillStyle = "#b8434f";
  ctx.beginPath();
  ctx.moveTo(2, -150);
  ctx.lineTo(26 + Math.sin(t / 260) * 3, -144);
  ctx.lineTo(2, -138);
  ctx.fill();
  // grand door
  ctx.fillStyle = "#6b4a2f";
  ctx.beginPath();
  ctx.moveTo(-12, -20);
  ctx.lineTo(-12, -46);
  ctx.arc(0, -46, 12, Math.PI, 0);
  ctx.lineTo(12, -20);
  ctx.fill();
  ctx.restore();
}

function hotel(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(1760, 500);
  shadow(ctx, 0, 4, 100, 14);
  ctx.fillStyle = "#f2d7c4";
  ctx.fillRect(-90, -110, 180, 112);
  ctx.fillStyle = "#e7c3ab";
  ctx.fillRect(-90, -110, 180, 10);
  ctx.fillStyle = "#b5523b";
  ctx.beginPath();
  ctx.moveTo(-98, -110);
  ctx.lineTo(-70, -132);
  ctx.lineTo(70, -132);
  ctx.lineTo(98, -110);
  ctx.fill();
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
    ctx.fillStyle = (r + c) % 3 === 0 ? "#f3d27a" : "#2b5a6a";
    ctx.fillRect(-80 + c * 21, -96 + r * 22, 11, 14);
    if (r === 1) {
      ctx.fillStyle = "#3a2a22";
      ctx.fillRect(-82 + c * 21, -80 + r * 22 - 18, 15, 2);
    }
  }
  // awning and entrance
  ctx.fillStyle = "#1e7a4f";
  ctx.fillRect(-30, -18, 60, 8);
  ctx.fillStyle = "#6b4a2f";
  ctx.fillRect(-12, -14, 24, 16);
  ctx.fillStyle = "#3a2a22";
  ctx.font = "700 11px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#d2a74e";
  ctx.fillText("GRAND HOTEL", 0, -114);
  ctx.restore();
}

function market(ctx: CanvasRenderingContext2D) {
  const stripes = [["#b8434f", "#f3ece0"], ["#1f8f8a", "#f3ece0"], ["#d2a74e", "#f3ece0"]];
  [[-70, 30], [0, 0], [70, 30]].forEach(([dx, dy], i) => {
    ctx.save();
    ctx.translate(MARKET_STALL.x + dx, MARKET_STALL.y + dy);
    shadow(ctx, 0, 2, 34, 8);
    ctx.fillStyle = "#8a6440";
    ctx.fillRect(-28, -16, 56, 16);
    ctx.fillRect(-26, -46, 3, 30);
    ctx.fillRect(23, -46, 3, 30);
    for (let s = 0; s < 6; s++) {
      ctx.fillStyle = stripes[i][s % 2];
      ctx.beginPath();
      ctx.moveTo(-32 + s * 11, -46);
      ctx.lineTo(-32 + (s + 1) * 11, -46);
      ctx.lineTo(-30 + (s + 1) * 11, -36);
      ctx.lineTo(-30 + s * 11, -36);
      ctx.fill();
    }
    // wares
    for (let w = 0; w < 4; w++) {
      ctx.fillStyle = ["#f3ece0", "#e7849a", "#f2d14b", "#9fd6ee"][(w + i) % 4];
      ctx.beginPath();
      ctx.arc(-18 + w * 12, -19, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
  ctx.fillStyle = "#3a2a22";
}

function lighthouse(ctx: CanvasRenderingContext2D, t: number, lit: boolean) {
  ctx.save();
  ctx.translate(LAMP.x, LAMP.y + 20);
  if (lit) {
    const a = t / 900;
    ctx.fillStyle = "rgba(255,236,160,.18)";
    ctx.beginPath();
    ctx.moveTo(0, -108);
    ctx.arc(0, -108, 520, a - 0.18, a + 0.18);
    ctx.closePath();
    ctx.fill();
  }
  shadow(ctx, 0, 0, 26, 8);
  ctx.fillStyle = "#f3ece0";
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(-11, -96);
  ctx.lineTo(11, -96);
  ctx.lineTo(18, 0);
  ctx.fill();
  ctx.fillStyle = "#b8434f";
  for (const y of [-20, -52, -84]) {
    const w1 = 18 - ((-y) / 96) * 7;
    const w2 = 18 - ((-y + 14) / 96) * 7;
    ctx.beginPath();
    ctx.moveTo(-w1, y);
    ctx.lineTo(-w2, y - 14);
    ctx.lineTo(w2, y - 14);
    ctx.lineTo(w1, y);
    ctx.fill();
  }
  ctx.fillStyle = "#1d2b33";
  ctx.fillRect(-14, -100, 28, 5);
  ctx.fillStyle = lit ? "#fff3b0" : "#9fb8b8";
  ctx.fillRect(-9, -118, 18, 18);
  if (lit) {
    ctx.fillStyle = "rgba(255,240,170,.5)";
    ctx.beginPath();
    ctx.arc(0, -109, 22 + Math.sin(t / 150) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1d2b33";
  ctx.beginPath();
  ctx.moveTo(-12, -118);
  ctx.lineTo(0, -130);
  ctx.lineTo(12, -118);
  ctx.fill();
  ctx.restore();
}

function stables(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save();
  ctx.translate(STABLE_POS.x, STABLE_POS.y - 10);
  shadow(ctx, 0, 2, 70, 12);
  ctx.fillStyle = "#9a4a32";
  ctx.fillRect(-60, -50, 120, 50);
  ctx.fillStyle = "#6b2f20";
  ctx.beginPath();
  ctx.moveTo(-68, -50);
  ctx.lineTo(0, -82);
  ctx.lineTo(68, -50);
  ctx.fill();
  ctx.strokeStyle = "#f3ece0";
  ctx.lineWidth = 3;
  for (const x of [-38, 0, 38]) {
    ctx.strokeRect(x - 14, -36, 28, 36);
    ctx.beginPath();
    ctx.moveTo(x - 14, -36);
    ctx.lineTo(x + 14, 0);
    ctx.moveTo(x + 14, -36);
    ctx.lineTo(x - 14, 0);
    ctx.stroke();
  }
  ctx.restore();
  // Two horses waiting at the rail.
  drawHorse(ctx, STABLE_POS.x - 40, STABLE_POS.y + 22, 1, false, t, "#7a4a2a");
  drawHorse(ctx, STABLE_POS.x + 44, STABLE_POS.y + 26, -1, false, t + 500, "#f1ead9");
  ctx.strokeStyle = "#6b4a2f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(STABLE_POS.x - 80, STABLE_POS.y + 12);
  ctx.lineTo(STABLE_POS.x + 80, STABLE_POS.y + 12);
  ctx.stroke();
}

function gazebo(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(600, 470);
  shadow(ctx, 0, 2, 40, 10);
  ctx.fillStyle = "#f3ece0";
  for (const x of [-30, -10, 10, 30]) ctx.fillRect(x - 3, -46, 6, 46);
  ctx.fillStyle = "#e7849a";
  ctx.beginPath();
  ctx.moveTo(-42, -46);
  ctx.quadraticCurveTo(0, -86, 42, -46);
  ctx.fill();
  ctx.fillStyle = "#d2a74e";
  ctx.fillRect(-2, -82, 4, 10);
  // trellis of roses
  ctx.fillStyle = "#4f8f45";
  ctx.fillRect(-60, -6, 120, 8);
  ctx.fillStyle = "#e7849a";
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.arc(-56 + i * 12.5, -4, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function wreck(ctx: CanvasRenderingContext2D, level: number) {
  ctx.save();
  ctx.translate(600, 1320);
  ctx.globalAlpha = level > 0.8 ? 0.55 : 1;
  ctx.rotate(-0.18);
  shadow(ctx, 0, 6, 80, 12);
  ctx.fillStyle = "#5e4228";
  ctx.beginPath();
  ctx.moveTo(-80, -10);
  ctx.quadraticCurveTo(-60, 14, 0, 12);
  ctx.lineTo(60, 8);
  ctx.lineTo(74, -26);
  ctx.lineTo(30, -16);
  ctx.lineTo(10, -30);
  ctx.lineTo(-20, -14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#3a2a1a";
  ctx.lineWidth = 2;
  for (let i = -60; i < 60; i += 14) {
    ctx.beginPath();
    ctx.moveTo(i, -16);
    ctx.lineTo(i + 4, 10);
    ctx.stroke();
  }
  ctx.strokeStyle = "#4a3420";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-10, -18);
  ctx.lineTo(-30, -80);
  ctx.stroke();
  ctx.fillStyle = "rgba(243,236,224,.8)";
  ctx.beginPath();
  ctx.moveTo(-28, -76);
  ctx.lineTo(-6, -56);
  ctx.lineTo(-22, -46);
  ctx.fill();
  ctx.restore();
}

function cave(ctx: CanvasRenderingContext2D, open: boolean) {
  ctx.save();
  ctx.translate(CAVE.x, CAVE.y);
  // the rock dome over the chamber
  ctx.fillStyle = open ? "rgba(60,50,60,.55)" : "#8a8070";
  ctx.beginPath();
  ctx.ellipse(0, 0, CAVE.r + 8, CAVE.r - 4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!open) {
    ctx.fillStyle = "#9d9381";
    ctx.beginPath();
    ctx.ellipse(-16, -18, 50, 32, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b3a994";
    ctx.beginPath();
    ctx.ellipse(-24, -26, 22, 12, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "rgba(120,200,240,.25)";
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(-50 + i * 16, -30);
      ctx.lineTo(-44 + i * 16, -50);
      ctx.lineTo(-38 + i * 16, -30);
      ctx.fill();
    }
  }
  ctx.restore();
  // the door
  ctx.save();
  ctx.translate(CAVE_DOOR.x, CAVE_DOOR.y);
  ctx.fillStyle = "#2a2228";
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.lineTo(-22, -26);
  ctx.arc(0, -26, 22, Math.PI, 0);
  ctx.lineTo(22, 0);
  ctx.fill();
  if (!open) {
    ctx.strokeStyle = "#c9a352";
    ctx.lineWidth = 2.5;
    for (let x = -16; x <= 16; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, -40);
      ctx.stroke();
    }
    ctx.fillStyle = "#d2a74e";
    ctx.beginPath();
    ctx.arc(0, -26, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b8434f";
    ctx.beginPath();
    ctx.moveTo(0, -33);
    ctx.lineTo(3, -26);
    ctx.lineTo(0, -19);
    ctx.lineTo(-3, -26);
    ctx.fill();
  }
  ctx.restore();
}

function buoy(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, i: number) {
  const bob = Math.sin(t / 400 + i) * 2;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.strokeStyle = "rgba(255,255,255,.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 4, 14 + (t / 60 + i * 10) % 10, 5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#b8434f";
  ctx.beginPath();
  ctx.arc(0, -4, 8, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#f3ece0";
  ctx.fillRect(-8, -4, 16, 6);
  ctx.fillStyle = "#3a2a22";
  ctx.fillRect(-1, -22, 2, 16);
  ctx.fillStyle = "#f2d14b";
  ctx.beginPath();
  ctx.moveTo(1, -22);
  ctx.lineTo(12, -18);
  ctx.lineTo(1, -14);
  ctx.fill();
  ctx.restore();
}

// ---------- people and horses ----------

export function drawHorse(ctx: CanvasRenderingContext2D, x: number, y: number, face: number, moving: boolean, t: number, coat: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  shadow(ctx, 0, 0, 26, 6);
  const gait = moving ? Math.sin(t / 70) : 0;
  const bob = moving ? Math.abs(Math.sin(t / 70)) * 2 : 0;
  ctx.translate(0, -bob);
  // legs
  ctx.strokeStyle = coat === "#f1ead9" ? "#cfc4b0" : "#2b211c";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  const leg = (lx: number, phase: number) => {
    ctx.beginPath();
    ctx.moveTo(lx, -18);
    ctx.lineTo(lx + gait * 6 * phase, -1);
    ctx.stroke();
  };
  leg(-14, 1); leg(-9, -1); leg(10, -1); leg(15, 1);
  // body
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.ellipse(0, -24, 22, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // neck and head
  ctx.beginPath();
  ctx.moveTo(14, -30);
  ctx.quadraticCurveTo(22, -46, 26, -50);
  ctx.lineTo(34, -44);
  ctx.quadraticCurveTo(28, -36, 22, -24);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(32, -46, 9, 5, 0.5, 0, Math.PI * 2);
  ctx.fill();
  // mane and tail
  ctx.fillStyle = coat === "#f1ead9" ? "#b9a891" : "#1d1410";
  ctx.beginPath();
  ctx.moveTo(14, -32);
  ctx.quadraticCurveTo(20, -50, 27, -52);
  ctx.lineTo(24, -44);
  ctx.quadraticCurveTo(19, -38, 17, -30);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-21, -28);
  ctx.quadraticCurveTo(-34, -22 + gait * 3, -30, -8);
  ctx.quadraticCurveTo(-26, -18, -20, -22);
  ctx.fill();
  // saddle blanket
  ctx.fillStyle = "#b8434f";
  ctx.fillRect(-8, -33, 16, 9);
  ctx.fillStyle = "#d2a74e";
  ctx.fillRect(-8, -26, 16, 2);
  ctx.fillStyle = "#1d1410";
  ctx.beginPath();
  ctx.arc(34, -48, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export interface Avatar {
  x: number;
  y: number;
  dir: number;
  moving: boolean;
  mounted: boolean;
  role: Role | null;
  seat: number;
  busy: boolean;
  swim?: boolean;
  /** Knocked out: lying on the ground with stars overhead. */
  down?: boolean;
}

/** A dashing islander: long coat, signature hat, a cape for the grander roles. */
export function drawPerson(ctx: CanvasRenderingContext2D, a: Avatar, t: number) {
  if (a.down) {
    const face = Math.cos(a.dir) < -0.1 ? -1 : 1;
    ctx.save();
    ctx.translate(a.x + face * 18, a.y);
    shadow(ctx, -face * 20, 0, 24, 5);
    ctx.rotate(face * -Math.PI / 2);
    drawPerson(ctx, { ...a, x: 0, y: 4 * face, down: false, mounted: false, moving: false, busy: false, swim: false }, 0);
    ctx.restore();
    // dizzy stars
    for (let i = 0; i < 3; i++) {
      const ang = t / 300 + (i * Math.PI * 2) / 3;
      const sx = a.x - face * 24 + Math.cos(ang) * 12;
      const sy = a.y - 18 + Math.sin(ang) * 4;
      ctx.fillStyle = "#f2d14b";
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? 1.6 : 4;
        ctx.lineTo(sx + Math.cos((k * Math.PI) / 5 - Math.PI / 2) * rr, sy + Math.sin((k * Math.PI) / 5 - Math.PI / 2) * rr);
      }
      ctx.fill();
    }
    return;
  }
  const look = a.role ? ROLE_LOOK[a.role] : { coat: "#2b4650", trim: "#d2a74e", hat: "bowler" as const, cape: undefined };
  const face = Math.cos(a.dir) < -0.1 ? -1 : 1;
  const skin = SKIN[a.seat % SKIN.length];
  const hair = HAIR[(a.seat * 3) % HAIR.length];
  ctx.save();
  ctx.translate(a.x, a.y);
  if (a.mounted) {
    drawHorse(ctx, 0, 0, face, a.moving, t, HORSE_COATS[a.seat % HORSE_COATS.length]);
    ctx.translate(-2 * face, -30 - (a.moving ? Math.abs(Math.sin(t / 70)) * 2 : 0));
  } else {
    shadow(ctx, 0, 0, 11, 4);
  }
  if (a.busy || (a.swim && !a.mounted)) {
    // Diving or swimming: ripples, and a head above the water when swimming.
    ctx.strokeStyle = "rgba(255,255,255,.7)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 10 + ((t / 50 + i * 10) % 16), 4 + ((t / 50 + i * 10) % 16) / 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (a.swim && !a.busy) {
      ctx.translate(0, 30 + Math.sin(t / 200) * 1.5);
      ctx.scale(face, 1);
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(0, -37, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(-1, -39, 6.5, Math.PI * 0.9, Math.PI * 1.9);
      ctx.fill();
      drawHat(ctx, look.hat, look.trim, t);
    }
    ctx.restore();
    return;
  }
  ctx.scale(face, 1);
  const step = a.moving && !a.mounted ? Math.sin(t / 90) : 0;
  const bob = a.moving && !a.mounted ? Math.abs(Math.cos(t / 90)) * 1.5 : 0;
  ctx.translate(0, -bob);
  // cape behind
  if (look.cape) {
    ctx.fillStyle = look.cape;
    ctx.beginPath();
    ctx.moveTo(-5, -30);
    ctx.quadraticCurveTo(-16 - (a.moving ? 6 : 0), -14, -12 - (a.moving ? 8 + step * 2 : 0), -4);
    ctx.lineTo(2, -8);
    ctx.closePath();
    ctx.fill();
  }
  // legs (hidden when riding)
  if (!a.mounted) {
    ctx.strokeStyle = "#2b211c";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-2, -12);
    ctx.lineTo(-2 + step * 4, 0);
    ctx.moveTo(3, -12);
    ctx.lineTo(3 - step * 4, 0);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "#2b211c";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(1, -12);
    ctx.lineTo(5, -2);
    ctx.stroke();
  }
  // long coat
  ctx.fillStyle = look.coat;
  ctx.beginPath();
  ctx.moveTo(-6, -31);
  ctx.lineTo(6, -31);
  ctx.quadraticCurveTo(9, -20, 8 + (a.moving ? -step : 0), -9);
  ctx.lineTo(-8 - (a.moving ? 2 : 0), -9);
  ctx.quadraticCurveTo(-9, -20, -6, -31);
  ctx.fill();
  // lapel / sash
  ctx.strokeStyle = look.trim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, -30);
  ctx.lineTo(4, -15);
  ctx.stroke();
  ctx.fillStyle = "#d2a74e";
  ctx.beginPath();
  ctx.arc(3, -24, 1.2, 0, Math.PI * 2);
  ctx.arc(3, -19, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // arm swing
  ctx.strokeStyle = look.coat;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(4, -28);
  ctx.lineTo(6 - step * 4, -17);
  ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(6 - step * 4, -16, 1.8, 0, Math.PI * 2);
  ctx.fill();
  // head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, -37, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(-1, -39, 6.5, Math.PI * 0.9, Math.PI * 1.9);
  ctx.fill();
  if (a.role === "duchess") {
    ctx.beginPath();
    ctx.ellipse(-5, -34, 3, 6, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#2b1d14";
  ctx.beginPath();
  ctx.arc(3, -38, 0.9, 0, Math.PI * 2);
  ctx.fill();
  drawHat(ctx, look.hat, look.trim, t);
  ctx.restore();
}

function drawHat(ctx: CanvasRenderingContext2D, hat: string, trim: string, t: number) {
  switch (hat) {
    case "tophat":
      ctx.fillStyle = "#1d1410";
      ctx.fillRect(-7, -45, 14, 2.5);
      ctx.fillRect(-4.5, -55, 9, 10);
      ctx.fillStyle = "#b8434f";
      ctx.fillRect(-4.5, -47.5, 9, 2);
      break;
    case "tricorn":
      ctx.fillStyle = "#2a1a48";
      ctx.beginPath();
      ctx.moveTo(-9, -43);
      ctx.quadraticCurveTo(0, -54, 9, -43);
      ctx.quadraticCurveTo(0, -46, -9, -43);
      ctx.fill();
      ctx.fillStyle = "#d2a74e";
      ctx.beginPath();
      ctx.moveTo(-3, -50);
      ctx.quadraticCurveTo(-10, -58 + Math.sin(t / 200), -12, -54);
      ctx.quadraticCurveTo(-8, -52, -3, -48);
      ctx.fill();
      break;
    case "bowler":
      ctx.fillStyle = "#1d2b33";
      ctx.fillRect(-7.5, -44, 15, 2);
      ctx.beginPath();
      ctx.arc(0, -44, 5.5, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = "#d2a74e";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(3.2, -37.5, 2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "tiara":
      ctx.fillStyle = "#e9c46a";
      ctx.beginPath();
      ctx.moveTo(-5, -43);
      ctx.lineTo(-4, -48);
      ctx.lineTo(-2, -45);
      ctx.lineTo(0, -50);
      ctx.lineTo(2, -45);
      ctx.lineTo(4, -48);
      ctx.lineTo(5, -43);
      ctx.fill();
      ctx.fillStyle = "#9fd6ee";
      ctx.beginPath();
      ctx.arc(0, -47, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f3ece0";
      for (let i = -4; i <= 4; i += 2) {
        ctx.beginPath();
        ctx.arc(i, -29, 1, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "goggles":
      ctx.fillStyle = "#3a2a22";
      ctx.fillRect(-7, -42, 14, 2.5);
      ctx.fillStyle = "#9fd6ee";
      ctx.strokeStyle = "#d2a74e";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(-1, -41, 2.6, 0, Math.PI * 2);
      ctx.arc(4, -41, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "scarf":
      ctx.fillStyle = trim === "#bff2ea" ? "#3fc1b5" : trim;
      ctx.beginPath();
      ctx.arc(0, -39, 7, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-6, -38);
      ctx.quadraticCurveTo(-14, -34 + Math.sin(t / 150) * 2, -16, -28);
      ctx.lineTo(-11, -32);
      ctx.fill();
      ctx.fillStyle = "#f3ece0";
      ctx.beginPath();
      ctx.arc(-5, -34, 1.3, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

// ---------- cargo ----------

const KIND_COL: Record<Kind, [string, string]> = {
  fuel: ["#c9783a", "#7d4520"],
  medicine: ["#e3f0ec", "#b8434f"],
  tools: ["#6b4a2f", "#d2a74e"],
  diamond: ["#bfe8f5", "#3d8fb8"],
  compass: ["#e9c46a", "#8a6420"],
  cutlass: ["#dfe6ea", "#8a6420"],
};

export function drawItem(ctx: CanvasRenderingContext2D, kind: Kind, x: number, y: number, size: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 20, size / 20);
  const [a, b] = KIND_COL[kind];
  if (kind === "diamond") {
    ctx.fillStyle = a;
    ctx.strokeStyle = b;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(-5, -10);
    ctx.lineTo(5, -10);
    ctx.lineTo(9, -4);
    ctx.lineTo(0, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(9, -4);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t / 200)})`;
    ctx.beginPath();
    ctx.arc(6, -10, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "cutlass") {
    // a curved silver blade with a brass basket hilt
    ctx.rotate(-0.7);
    ctx.fillStyle = a;
    ctx.strokeStyle = "#5d6970";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-2, 4);
    ctx.quadraticCurveTo(-4, -6, 2, -13);
    ctx.quadraticCurveTo(1, -5, 2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(t / 220)})`;
    ctx.fillRect(-1.5, -8, 1, 6);
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.ellipse(0, 5, 5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a2f22";
    ctx.fillRect(-1.2, 6, 2.4, 5);
    ctx.fillStyle = "#e9c46a";
    ctx.beginPath();
    ctx.arc(0, 11.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "compass") {
    ctx.fillStyle = a;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4ecd8";
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.rotate(Math.sin(t / 500) * 0.5);
    ctx.fillStyle = "#b8434f";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(2, 0);
    ctx.lineTo(-2, 0);
    ctx.fill();
    ctx.fillStyle = "#33403f";
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(2, 0);
    ctx.lineTo(-2, 0);
    ctx.fill();
    ctx.restore();
  } else {
    // a wooden crate with a painted label
    ctx.fillStyle = "#b08050";
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeStyle = "#6b4a2f";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.beginPath();
    ctx.moveTo(-9, -9);
    ctx.lineTo(9, 9);
    ctx.stroke();
    ctx.fillStyle = a;
    ctx.fillRect(-6, -5, 12, 10);
    ctx.fillStyle = b;
    if (kind === "medicine") {
      ctx.fillRect(-1.5, -4, 3, 8);
      ctx.fillRect(-4, -1.5, 8, 3);
    } else if (kind === "fuel") {
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.quadraticCurveTo(4, 1, 0, 4);
      ctx.quadraticCurveTo(-4, 1, 0, -4);
      ctx.fill();
    } else {
      ctx.fillRect(-4, -1, 8, 2);
      ctx.beginPath();
      ctx.arc(4, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A crate waiting on the ground: bobbing, with a glow so it reads from afar. */
export function drawCrate(ctx: CanvasRenderingContext2D, kind: Kind, x: number, y: number, t: number, seed: number, grow = 1) {
  if (grow !== 1) {
    // Drawn bigger when the camera is zoomed far out, so crates still read.
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(grow, grow);
    drawCrate(ctx, kind, 0, 0, t, seed);
    ctx.restore();
    return;
  }
  const bob = Math.sin(t / 350 + seed) * 2;
  const glow = kind === "diamond" || kind === "compass" ? "rgba(160,230,255," : kind === "medicine" ? "rgba(255,170,180," : kind === "cutlass" ? "rgba(255,120,110," : "rgba(255,226,140,";
  ctx.fillStyle = `${glow}${0.2 + 0.12 * Math.sin(t / 300 + seed)})`;
  ctx.beginPath();
  ctx.ellipse(x, y, 22, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  shadow(ctx, x, y, 9, 3);
  drawItem(ctx, kind, x, y - 12 + bob, 22, t);
  if (kind === "diamond") {
    // a twinkle that catches the eye from across the island
    const tw = (Math.sin(t / 260 + seed * 3) + 1) / 2;
    ctx.save();
    ctx.translate(x + 9, y - 24 + bob);
    ctx.rotate(t / 900);
    ctx.fillStyle = `rgba(255,255,255,${0.35 + tw * 0.65})`;
    const r = 3 + tw * 6;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? r * 0.25 : r;
      ctx.lineTo(Math.cos((i * Math.PI) / 4) * rr, Math.sin((i * Math.PI) / 4) * rr);
    }
    ctx.fill();
    ctx.restore();
  }
}

export function drawPearls(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, t: number) {
  for (let i = 0; i < Math.min(4, n); i++) {
    const px = x + (i - (n - 1) / 2) * 6;
    ctx.fillStyle = "#f6f0e6";
    ctx.beginPath();
    ctx.arc(px, y - 3, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.6 + 0.4 * Math.sin(t / 250 + i)})`;
    ctx.beginPath();
    ctx.arc(px - 1, y - 4.2, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Sparkles on the open water so the sea feels alive. */
export function drawGlints(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, level: number, t: number) {
  ctx.strokeStyle = "rgba(220,250,245,.45)";
  ctx.lineWidth = 1.5;
  const step = 70;
  for (let gx = Math.floor(x0 / step) * step; gx < x1; gx += step) {
    for (let gy = Math.floor(y0 / step) * step; gy < y1; gy += step) {
      const h = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453;
      const r = h - Math.floor(h);
      const x = gx + r * step;
      const y = gy + ((r * 7) % 1) * step;
      if (elev(x, y) > level - 0.25) continue;
      const ph = (t / 1400 + r * 10) % 1;
      const a = Math.sin(ph * Math.PI);
      ctx.globalAlpha = a * 0.8;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.quadraticCurveTo(x, y - 3, x + 6, y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

