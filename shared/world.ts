// The island of Saltmere: terrain, places and the rising tide.
// Pure functions shared by the server (authoritative movement) and the client (drawing).

export const W = 2400;
export const H = 1600;

export type ZoneId =
  | "harbour" | "coves" | "shipwreck" | "market" | "gardens"
  | "hotel" | "palace" | "lighthouse" | "caves" | "stables";

export interface Zone {
  name: string;
  x: number;
  y: number;
  r: number;
  blurb: string;
}

export const ZONES: Record<ZoneId, Zone> = {
  harbour: { name: "The Harbour", x: 1160, y: 1300, r: 150, blurb: "Fuel and tools on the quay. Floods mid-game." },
  coves: { name: "Turquoise Coves", x: 430, y: 900, r: 170, blurb: "Dive for pearls. Among the first to go under." },
  shipwreck: { name: "The Shipwreck", x: 640, y: 1250, r: 130, blurb: "A diamond in the hold. Floods first." },
  market: { name: "Pearl Market", x: 1760, y: 1060, r: 140, blurb: "Barter pearls for supplies." },
  gardens: { name: "Hanging Gardens", x: 600, y: 470, r: 150, blurb: "Medicine grows on the terraces." },
  hotel: { name: "Grand Hotel", x: 1760, y: 470, r: 140, blurb: "Tools in the cellar, diamonds in the safe." },
  palace: { name: "Hilltop Palace", x: 1200, y: 640, r: 130, blurb: "Never floods. The compass is kept here." },
  lighthouse: { name: "The Lighthouse", x: 2195, y: 800, r: 80, blurb: "Light the lamp to reveal every crate." },
  caves: { name: "Sapphire Caves", x: 1180, y: 215, r: 110, blurb: "Sealed. The compass opens the door." },
  stables: { name: "Royal Stables", x: 960, y: 880, r: 80, blurb: "Saddle a horse and ride twice as fast." },
};
export const ZONE_IDS = Object.keys(ZONES) as ZoneId[];

// ---------- terrain ----------

interface Mound { x: number; y: number; rx: number; ry: number; h: number; edge: number }
interface Ridge { x1: number; y1: number; x2: number; y2: number; w: number; h: number; edge: number }

const SEA = -2.2;

const MOUNDS: Mound[] = [
  { x: 1200, y: 800, rx: 960, ry: 560, h: 1.35, edge: 110 }, // island body
  { x: 1200, y: 640, rx: 110, ry: 95, h: 8, edge: 250 }, // palace hill
  { x: 960, y: 880, rx: 70, ry: 60, h: 5.5, edge: 130 }, // stables
  { x: 1760, y: 470, rx: 140, ry: 120, h: 4.2, edge: 110 }, // hotel
  { x: 600, y: 470, rx: 150, ry: 120, h: 3.15, edge: 100 }, // gardens
  { x: 1760, y: 1060, rx: 140, ry: 110, h: 2.25, edge: 90 }, // market
  { x: 1180, y: 230, rx: 130, ry: 100, h: 6, edge: 140 }, // caves hill
  { x: 2200, y: 800, rx: 60, ry: 60, h: 4.6, edge: 90 }, // lighthouse rock
];

const RIDGES: Ridge[] = [
  { x1: 1205, y1: 700, x2: 1250, y2: 1392, w: 30, h: 5, edge: 36 }, // Royal Causeway to the pier
  { x1: 1300, y1: 610, x2: 1660, y2: 495, w: 28, h: 4.2, edge: 50 }, // Hotel road
  { x1: 1100, y1: 610, x2: 720, y2: 500, w: 26, h: 3.15, edge: 50 }, // Gardens road
  { x1: 1195, y1: 520, x2: 1185, y2: 320, w: 30, h: 6, edge: 60 }, // Cave road
  { x1: 1960, y1: 860, x2: 2190, y2: 806, w: 34, h: 2.25, edge: 50 }, // lighthouse neck
];

/** Low ground cut into the body: the lagoon at the coves and the wreck beach. */
const BASINS: Mound[] = [
  { x: 250, y: 905, rx: 110, ry: 120, h: -0.7, edge: 70 },
  { x: 620, y: 1300, rx: 150, ry: 90, h: 0.45, edge: 90 },
];

/** Hidden stepping stones from the lighthouse to the Hotel road, walkable once found. */
export const SECRET_PATH = { x1: 2170, y1: 760, x2: 1840, y2: 520, w: 22 };

/** The pier and landing stage: always above water. */
export const DOCK = { x1: 1218, y1: 1360, x2: 1282, y2: 1500 };
export const LANDING = { x1: 1170, y1: 1468, x2: 1400, y2: 1508 };
/** Where cargo is loaded aboard. */
export const GANGWAY = { x: 1340, y: 1488, r: 46 };
export const FERRY = { x: 1290, y: 1602 };

/** The sealed cave chamber; walls you can't enter until the compass opens the door. */
export const CAVE = { x: 1180, y: 200, r: 72 };
export const CAVE_DOOR = { x: 1182, y: 272 };

export const STABLE_POS = { x: 960, y: 880 };
export const MARKET_STALL = { x: 1770, y: 1045 };
export const LAMP = { x: 2200, y: 785 };
export const DIVE_SPOTS = [
  { x: 300, y: 860 },
  { x: 290, y: 960 },
  { x: 340, y: 1010 },
];

function smooth(t: number) {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

function moundAt(m: Mound, x: number, y: number) {
  const dx = (x - m.x) / m.rx;
  const dy = (y - m.y) / m.ry;
  const dn = Math.sqrt(dx * dx + dy * dy);
  if (dn <= 1) return m.h;
  const beyond = (dn - 1) * Math.min(m.rx, m.ry);
  return m.h + (SEA - m.h) * smooth(beyond / m.edge);
}

function segDist(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - (x1 + t * vx), y - (y1 + t * vy));
}

function ridgeAt(r: Ridge, x: number, y: number) {
  const d = segDist(x, y, r.x1, r.y1, r.x2, r.y2);
  if (d <= r.w / 2) return r.h;
  return r.h + (SEA - r.h) * smooth((d - r.w / 2) / r.edge);
}

function basinAt(b: Mound, x: number, y: number) {
  const dx = (x - b.x) / b.rx;
  const dy = (y - b.y) / b.ry;
  const dn = Math.sqrt(dx * dx + dy * dy);
  if (dn <= 1) return b.h;
  const beyond = (dn - 1) * Math.min(b.rx, b.ry);
  return b.h + 12 * smooth(beyond / b.edge);
}

function hash(ix: number, iy: number) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Height above the original sea level. Negative is open sea. */
export function elevation(x: number, y: number): number {
  // The coastline is drawn through a gentle warp so it wanders like a real shore.
  const wx = x + (valueNoise(x / 260 + 7.3, y / 260) - 0.5) * 230 + (valueNoise(x / 90, y / 90 + 3.1) - 0.5) * 50;
  const wy = y + (valueNoise(x / 260, y / 260 + 11.7) - 0.5) * 190 + (valueNoise(x / 90 + 5.2, y / 90) - 0.5) * 40;
  let e = moundAt(MOUNDS[0], wx, wy);
  const mx = x * 0.6 + wx * 0.4;
  const my = y * 0.6 + wy * 0.4;
  for (const m of MOUNDS.slice(1)) e = Math.max(e, moundAt(m, mx, my));
  for (const r of RIDGES) e = Math.max(e, ridgeAt(r, x, y));
  for (const b of BASINS) e = Math.min(e, basinAt(b, wx * 0.5 + x * 0.5, wy * 0.5 + y * 0.5));
  // A little roughness so coastlines look natural. Kept small so places flood on schedule.
  const n = valueNoise(x / 90, y / 90) * 0.55 + valueNoise(x / 33, y / 33) * 0.2 - 0.375;
  return e + (e > -1.5 ? n * 0.6 : n);
}

// A coarse cache of elevation, so collision checks are cheap on the server.
const CELL = 8;
const GW = Math.ceil(W / CELL) + 1;
const GH = Math.ceil(H / CELL) + 1;
let grid: Float32Array | null = null;
function elevGrid() {
  if (!grid) {
    grid = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) grid[j * GW + i] = elevation(i * CELL, j * CELL);
  }
  return grid;
}

/** Bilinear lookup of the cached elevation. */
export function elev(x: number, y: number): number {
  const g = elevGrid();
  const fx = Math.max(0, Math.min(GW - 1.001, x / CELL));
  const fy = Math.max(0, Math.min(GH - 1.001, y / CELL));
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const a = g[j * GW + i];
  const b = g[j * GW + i + 1];
  const c = g[(j + 1) * GW + i];
  const d = g[(j + 1) * GW + i + 1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

export function inRect(x: number, y: number, r: { x1: number; y1: number; x2: number; y2: number }) {
  return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
}

export function onDock(x: number, y: number) {
  return inRect(x, y, DOCK) || inRect(x, y, LANDING);
}

export function onSecretPath(x: number, y: number) {
  const s = SECRET_PATH;
  return segDist(x, y, s.x1, s.y1, s.x2, s.y2) <= s.w / 2;
}

/** How deep the water at a point is, given the current sea level (0 = dry). */
export function depthAt(x: number, y: number, level: number) {
  return Math.max(0, level - elev(x, y));
}

export interface Ground {
  level: number;
  secretFound: boolean;
  caveOpen: boolean;
}

export const WADE_DEPTH = 0.35;
export const SWIM_DEPTH = 1.1;

/** Speed multiplier here: 1 on land, slower wading, slow swimming in flooded ground, 0 in open sea. */
export function footing(x: number, y: number, g: Ground): number {
  if (x < 0 || y < 0 || x > W || y > H) return 0;
  if (!g.caveOpen && Math.hypot(x - CAVE.x, y - CAVE.y) < CAVE.r) return 0;
  if (onDock(x, y)) return 1;
  if (g.secretFound && onSecretPath(x, y)) return 0.85;
  const d = depthAt(x, y, g.level);
  if (d <= 0) return 1;
  if (d < WADE_DEPTH) return 0.55;
  // You can swim across drowned land, slowly, but not out into the original sea.
  if (d < SWIM_DEPTH && elev(x, y) > -0.3) return 0.3;
  return 0;
}

/** True where someone would be swimming rather than walking. */
export function swimming(x: number, y: number, g: Ground) {
  return !onDock(x, y) && !(g.secretFound && onSecretPath(x, y)) && depthAt(x, y, g.level) >= WADE_DEPTH;
}

// ---------- the tide ----------

export const TIDE_MS = 180_000;
export const QUICK_TIDE_MS = 150_000;
export const RISE_MS = 9_000;

/** Sea level during tide n (1-based). Each tide floods the next band of the island. */
export function tideLevel(n: number, totalTides: number) {
  const top = 3.6;
  return (Math.max(0, n - 1) * top) / Math.max(1, totalTides - 1);
}

/** The sea level at a moment, with the water rising smoothly at the start of each tide. */
export function seaLevel(tide: number, tideStartedAt: number, totalTides: number, now: number) {
  const to = tideLevel(tide, totalTides);
  if (tide <= 1) return to;
  const from = tideLevel(tide - 1, totalTides);
  const t = Math.max(0, Math.min(1, (now - tideStartedAt) / RISE_MS));
  return from + (to - from) * smooth(t);
}

/** The place a point belongs to, if any. */
export function zoneAt(x: number, y: number): ZoneId | null {
  let best: ZoneId | null = null;
  let bestD = Infinity;
  for (const id of ZONE_IDS) {
    const z = ZONES[id];
    const d = Math.hypot(x - z.x, y - z.y);
    if (d < z.r && d < bestD) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

/** Which tide drowns each place (for the map legend). 0 means it never floods in this game. */
export function floodsAtTide(id: ZoneId, totalTides: number): number {
  const z = ZONES[id];
  const e = elev(z.x, z.y);
  for (let n = 2; n <= totalTides; n++) if (tideLevel(n, totalTides) > e) return n;
  return 0;
}

/** Nearest point you can stand on, searching outward in rings. */
export function nearestFooting(x: number, y: number, g: Ground): { x: number; y: number } {
  if (footing(x, y, g) >= 0.5) return { x, y };
  for (let r = 12; r < 900; r += 12) {
    const steps = Math.max(8, Math.floor(r / 6));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (footing(px, py, g) >= 1) return { x: px, y: py };
    }
  }
  return { x: (DOCK.x1 + DOCK.x2) / 2, y: DOCK.y1 + 20 };
}

/** True if a straight walk from a to b stays on walkable ground. */
export function clearLine(ax: number, ay: number, bx: number, by: number, g: Ground) {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(d / 4));
  for (let i = 1; i <= n; i++) {
    if (footing(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, g) <= 0) return false;
  }
  return true;
}

// ---------- path finding (for bots) ----------

const PC = 24;
const PW = Math.ceil(W / PC);
const PH = Math.ceil(H / PC);

/** A* over a coarse grid. Returns waypoints (excluding the start), or null if unreachable. */
export function findPath(ax: number, ay: number, bx: number, by: number, g: Ground): { x: number; y: number }[] | null {
  const cellF = new Float32Array(PW * PH).fill(-1);
  const fAt = (i: number, j: number) => {
    const k = j * PW + i;
    if (cellF[k] < 0) cellF[k] = footing(i * PC + PC / 2, j * PC + PC / 2, g);
    return cellF[k];
  };
  const ok = (i: number, j: number) => fAt(i, j) > 0;
  const si = Math.min(PW - 1, Math.max(0, Math.floor(ax / PC)));
  const sj = Math.min(PH - 1, Math.max(0, Math.floor(ay / PC)));
  let ti = Math.min(PW - 1, Math.max(0, Math.floor(bx / PC)));
  let tj = Math.min(PH - 1, Math.max(0, Math.floor(by / PC)));
  if (!ok(ti, tj)) {
    // Aim for the nearest open cell to the target.
    let found = false;
    for (let r = 1; r < 6 && !found; r++) {
      for (let dj = -r; dj <= r && !found; dj++) for (let di = -r; di <= r && !found; di++) {
        const i = ti + di;
        const j = tj + dj;
        if (i >= 0 && j >= 0 && i < PW && j < PH && ok(i, j)) {
          ti = i;
          tj = j;
          found = true;
        }
      }
    }
    if (!found) return null;
  }
  const start = sj * PW + si;
  const goal = tj * PW + ti;
  const gScore = new Float32Array(PW * PH).fill(Infinity);
  const came = new Int32Array(PW * PH).fill(-1);
  const closed = new Uint8Array(PW * PH);
  gScore[start] = 0;
  // Small binary heap of [f, index].
  const heap: [number, number][] = [[0, start]];
  const push = (f: number, k: number) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  let expanded = 0;
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === goal) break;
    if (++expanded > 6000) return null;
    const i = k % PW;
    const j = (k - i) / PW;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= PW || nj >= PH || !ok(ni, nj)) continue;
      if (di && dj && (!ok(i + di, j) || !ok(i, j + dj))) continue;
      const nk = nj * PW + ni;
      const cost = gScore[k] + (di && dj ? 1.414 : 1) / fAt(ni, nj);
      if (cost < gScore[nk]) {
        gScore[nk] = cost;
        came[nk] = k;
        push(cost + Math.hypot(ti - ni, tj - nj), nk);
      }
    }
  }
  if (came[goal] === -1 && goal !== start) return null;
  const cells: number[] = [];
  for (let k = goal; k !== start && k !== -1; k = came[k]) cells.push(k);
  cells.reverse();
  const pts = cells.map((k) => ({ x: (k % PW) * PC + PC / 2, y: Math.floor(k / PW) * PC + PC / 2 }));
  if (pts.length) pts[pts.length - 1] = { x: bx, y: by };
  // Drop waypoints we can see past, so bots walk in straight lines.
  const out: { x: number; y: number }[] = [];
  let cx = ax;
  let cy = ay;
  for (let n = 0; n < pts.length; n++) {
    const next = pts[n + 1];
    if (next && clearLine(cx, cy, next.x, next.y, g)) continue;
    out.push(pts[n]);
    cx = pts[n].x;
    cy = pts[n].y;
  }
  return out;
}
