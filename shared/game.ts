// Sink or Sail: rules engine for the open-world island. Pure game logic shared by the
// server (authoritative) and the client (types and helpers). The server owns the only
// real GameState, runs tick() ten times a second, and sends each player viewFor().

import {
  CAVE, CAVE_DOOR, DIVE_SPOTS, DOCK, GANGWAY, LAMP, MARKET_STALL, QUICK_TIDE_MS, STABLE_POS, TIDE_MS,
  BUILDINGS, H, W, ZONES, ZONE_IDS, type Building, type BuildingId, type Ground, type ZoneId, buildingAt, buildingOpen, depthAt,
  footing, insideDoor, nearestFooting, onDock, outdoorPos, seaLevel, zoneAt,
} from "./world";

export type Supply = "fuel" | "medicine" | "tools";
export type Kind = Supply | "diamond" | "compass" | "cutlass";
export type Role = "diver" | "engineer" | "physician" | "cartographer" | "jeweler" | "duchess";
export type Phase = "lobby" | "play" | "sailing" | "over";

export const SUPPLIES: Supply[] = ["fuel", "medicine", "tools"];
export const KINDS: Kind[] = ["fuel", "medicine", "tools", "diamond", "compass", "cutlass"];
export const ROLES: Role[] = ["diver", "engineer", "physician", "cartographer", "jeweler", "duchess"];

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 8;
/** Crates the ferry must carry to make the crossing (any kind counts): at least this many,
 *  more in bigger games, so a few busy bots can't do it without the people. */
export const GOAL = 20;
export const QUICK_GOAL = 12;
export const GOAL_PER_PLAYER = 8;
export const QUICK_GOAL_PER_PLAYER = 6;
/** The hold no longer fills up; this is only a guide for bots and the ferry picture. */
export const HOLD_SLOTS = 999;
export const QUICK_HOLD_SLOTS = 999;
/** Pearls a passenger pays for each supply loaded beyond what the crossing needs. */
export const SPARE_PEARLS = 2;

export const WALK_SPEED = 150;
export const RIDE_SPEED = 265;
export const CARTO_SPEED = 330;
export const PICKUP_R = 30;
/** An unanswered trade offer lapses after this long. */
export const OFFER_MS = 20_000;
export const TRADE_R = 110;
export const BARTER_COST = 3;
export const DUMP_COOLDOWN = 45_000;
export const SAIL_COUNTDOWN = 15_000;
export const SAIL_MS = 7_000;
export const DIVE_MS = 2_500;
/** Crates wash up in this many waves each tide, evenly spaced. */
export const WAVES = 3;
export const STRIKE_R = 90;
/** Bots carry fewer crates than people, so people get a fair share. */
export const BOT_CARRY = 2;
export const KNOCKOUT_MS = 15_000;
/** After getting up, a knocked-out player can't be struck again for a while. */
export const GUARD_MS = 10_000;

export const KIND_INFO: Record<Kind, { name: string; slots: number; worth: number }> = {
  fuel: { name: "Fuel", slots: 1, worth: 0 },
  medicine: { name: "Medicine", slots: 1, worth: 0 },
  tools: { name: "Tools", slots: 1, worth: 0 },
  diamond: { name: "Diamond", slots: 2, worth: 3 },
  compass: { name: "Antique Compass", slots: 1, worth: 0 },
  cutlass: { name: "Cutlass", slots: 1, worth: 0 },
};

export const ROLE_INFO: Record<Role, { name: string; power: string; short: string; wear: string; mounted: boolean }> = {
  diver: { name: "The Pearl Diver", short: "Deep breath", power: "Dives bring up twice the pearls.", wear: "Silk scarf, salt-bleached linen, pearl earring", mounted: false },
  engineer: { name: "The Engineer", short: "Strong back", power: "Carries 4 crates instead of 3.", wear: "Brass goggles, oxblood waistcoat", mounted: false },
  physician: { name: "The Physician", short: "Keen eye", power: "Sees every medicine crate on the map.", wear: "Tweed frock coat, leather bag", mounted: false },
  cartographer: { name: "The Cartographer", short: "Fastest rider", power: "Starts on horseback and rides fastest of all.", wear: "Velvet riding coat, map case", mounted: true },
  jeweler: { name: "The Jeweler", short: "Silver tongue", power: "The merchant and bots always accept your deals.", wear: "Silk cravat, loupe, garnet brooch", mounted: false },
  duchess: { name: "The Duchess", short: "Hidden riches", power: "Starts on horseback. Every crate you open holds a bonus pearl.", wear: "Emerald velvet, pearl tiara", mounted: true },
};

export interface Settings {
  quick: boolean;
  wrecker: "auto" | "on" | "off";
}

export interface Item {
  id: string;
  kind: Kind;
}

export interface Crate extends Item {
  x: number;
  y: number;
  zone: ZoneId | "cave" | "dropped" | "indoors";
  /** Pearls tucked inside, found when it's picked up. */
  bonus?: number;
  /** A crate washed up for one player: only they can pick it up. */
  owner?: string;
}

export interface PearlPile {
  id: string;
  x: number;
  y: number;
  n: number;
}

export interface HoldItem extends Item {
  owner: string;
}

/** A passenger's private request: load these yourself this tide for a pearl reward. */
export interface Order {
  want: Partial<Record<Supply, number>>;
  got: Partial<Record<Supply, number>>;
  reward: number;
  done: boolean;
  tide: number;
}

export const ORDER_REWARD = 6;

export interface Player {
  id: string;
  name: string;
  seat: number;
  /** Chosen in the lobby; dealt at the start if empty. */
  choice: Role | null;
  role: Role | null;
  wrecker: boolean;
  bot: boolean;
  connected: boolean;
  x: number;
  y: number;
  /** Facing angle in radians. */
  dir: number;
  moving: boolean;
  mounted: boolean;
  carry: Item[];
  pearls: number;
  ready: boolean;
  brig: boolean;
  busyUntil: number;
  lastMoveAt: number;
  accused: boolean;
  lastDump: number;
  lastBarter: number;
  /** Diamonds this player loaded aboard. */
  loadedDiamonds: number;
  /** Knocked out by a cutlass until then, and safe from another strike until guardUntil. */
  downUntil: number;
  guardUntil: number;
  order: Order | null;
}

export interface Offer {
  id: string;
  from: string;
  to: string;
  give: { itemIds: string[]; pearls: number };
  want: { kinds: Partial<Record<Kind, number>>; pearls: number };
  giveItems: Item[];
  status: "open" | "accepted" | "declined" | "cancelled" | "failed";
  at: number;
}

export interface Vote {
  id: string;
  target: string;
  by: string;
  yes: string[];
  no: string[];
  endsAt: number;
  outcome: "open" | "jailed" | "freed";
}

export interface LogEntry {
  n: number;
  text: string;
  kind: "info" | "flood" | "trade" | "load" | "alert";
}

/** Short-lived world events the client turns into sounds and sparkles. */
export interface Fx {
  n: number;
  kind: "pickup" | "load" | "splash" | "dive" | "lamp" | "gate" | "sink" | "swept" | "barter" | "horse" | "trade" | "tide" | "brig" | "strike" | "wave";
  x: number;
  y: number;
  by?: string;
  /** What was picked up, so each kind can sound different. */
  item?: Kind | "pearl";
}

export interface Result {
  success: boolean;
  loaded: number;
  goal: number;
  winners: "islanders" | "wrecker" | "nobody";
  fortunes: { id: string; fortune: number; diamonds: number; pearls: number; aboard: boolean }[];
  grandFortune: string[];
  wreckers: string[];
  early: boolean;
}

export interface GameState {
  code: string;
  hostId: string;
  phase: Phase;
  settings: Settings;
  round: number;
  tide: number;
  totalTides: number;
  tideMs: number;
  tideStartedAt: number;
  startedAt: number;
  endsAt: number;
  sailAt: number | null;
  phaseEndsAt: number | null;
  players: Player[];
  crates: Crate[];
  piles: PearlPile[];
  hold: HoldItem[];
  offers: Offer[];
  vote: Vote | null;
  lampUntil: number;
  lampTide: number;
  secretFound: boolean;
  caveOpen: boolean;
  marketStock: number;
  diveReady: number[];
  /** How many of this tide's crate waves have washed up. */
  spawnedPart: number;
  /** Buildings the sea has reached; they stay shut. */
  closed: BuildingId[];
  log: LogEntry[];
  fx: Fx[];
  result: Result | null;
  nextId: number;
  /** Bumped whenever something other than movement changes. */
  version: number;
}

export type Rng = () => number;

// ---------- helpers ----------

const nid = (s: GameState, p: string) => `${p}${++s.nextId}`;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function log(s: GameState, text: string, kind: LogEntry["kind"] = "info") {
  s.log.push({ n: ++s.nextId, text, kind });
  if (s.log.length > 50) s.log.splice(0, s.log.length - 50);
  s.version++;
}

function fx(s: GameState, kind: Fx["kind"], x: number, y: number, by?: string, item?: Kind | "pearl") {
  s.fx.push({ n: ++s.nextId, kind, x: Math.round(x), y: Math.round(y), by, ...(item ? { item } : {}) });
  if (s.fx.length > 30) s.fx.splice(0, s.fx.length - 30);
  s.version++;
}

export function player(s: GameState, id: string): Player | undefined {
  return s.players.find((p) => p.id === id);
}

export function ground(s: GameState, now: number): Ground {
  return { level: levelNow(s, now), secretFound: s.secretFound, caveOpen: s.caveOpen };
}

export function levelNow(s: GameState, now: number) {
  if (s.phase === "lobby") return 0;
  return seaLevel(s.tide, s.tideStartedAt, s.totalTides, now);
}

export function carryLimit(p: { role: Role | null; bot?: boolean }) {
  const n = p.role === "engineer" ? 4 : 3;
  return p.bot ? Math.min(n, BOT_CARRY) : n;
}

export function speedOf(p: { mounted: boolean; role: Role | null }) {
  if (!p.mounted) return WALK_SPEED;
  return p.role === "cartographer" ? CARTO_SPEED : RIDE_SPEED;
}

export function slotsUsed(hold: Item[]): number {
  return hold.reduce((t, c) => t + KIND_INFO[c.kind].slots, 0);
}

export function goalOf(s: { settings: Settings; players: unknown[] }): number {
  const n = s.players.length;
  return s.settings.quick ? Math.max(QUICK_GOAL, QUICK_GOAL_PER_PLAYER * n) : Math.max(GOAL, GOAL_PER_PLAYER * n);
}

export function capacityOf(s: GameState) {
  return s.settings.quick ? QUICK_HOLD_SLOTS : HOLD_SLOTS;
}

export function suppliesIn(hold: Item[]): Record<Supply, number> {
  const out: Record<Supply, number> = { fuel: 0, medicine: 0, tools: 0 };
  for (const c of hold) if (c.kind in out) out[c.kind as Supply]++;
  return out;
}

export function needsMet(s: GameState) {
  return s.hold.length >= goalOf(s);
}

export function wreckerCount(s: GameState): number {
  const n = s.players.length;
  if (s.settings.wrecker === "off") return 0;
  if (s.settings.wrecker === "auto" && n < 5) return 0;
  if (n < 3) return 0;
  return n >= 7 ? 2 : 1;
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export function nearGangway(p: { x: number; y: number }) {
  return dist(p.x, p.y, GANGWAY.x, GANGWAY.y) < GANGWAY.r;
}

/** Inside a building, the lamp, the saddles and the shop counter work like the ones outside. */
function atStation(p: { x: number; y: number }, kind: "lamp" | "saddle" | "counter") {
  return BUILDINGS.some((b) => b.station?.kind === kind && dist(p.x, p.y, b.station.x, b.station.y) < 75);
}

export function nearStables(p: { x: number; y: number }) {
  return dist(p.x, p.y, STABLE_POS.x, STABLE_POS.y) < 80 || atStation(p, "saddle");
}

export function nearStall(p: { x: number; y: number }) {
  return dist(p.x, p.y, MARKET_STALL.x, MARKET_STALL.y) < 70 || atStation(p, "counter");
}

export function nearLamp(p: { x: number; y: number }) {
  return dist(p.x, p.y, LAMP.x, LAMP.y) < 60 || atStation(p, "lamp");
}

/** The building whose door you're standing at, if any. */
export function nearDoor(p: { x: number; y: number }): Building | null {
  return BUILDINGS.find((b) => dist(p.x, p.y, b.door.x, b.door.y) < 70) ?? null;
}

export function nearDive(p: { x: number; y: number }): number {
  return DIVE_SPOTS.findIndex((d) => dist(p.x, p.y, d.x, d.y) < 75);
}

// ---------- lobby ----------

export function createGame(code: string, hostId: string): GameState {
  return {
    code,
    hostId,
    phase: "lobby",
    settings: { quick: false, wrecker: "auto" },
    round: 0,
    tide: 0,
    totalTides: 5,
    tideMs: TIDE_MS,
    tideStartedAt: 0,
    startedAt: 0,
    endsAt: 0,
    sailAt: null,
    phaseEndsAt: null,
    players: [],
    crates: [],
    piles: [],
    hold: [],
    offers: [],
    vote: null,
    lampUntil: 0,
    lampTide: 0,
    secretFound: false,
    caveOpen: false,
    marketStock: 0,
    diveReady: DIVE_SPOTS.map(() => 0),
    spawnedPart: 0,
    closed: [],
    log: [],
    fx: [],
    result: null,
    nextId: 0,
    version: 0,
  };
}

export function addPlayer(s: GameState, id: string, name: string, bot = false): string | null {
  if (s.players.length >= MAX_PLAYERS) return "The room is full.";
  if (s.phase !== "lobby") return "That game has already started.";
  const used = new Set(s.players.map((p) => p.seat));
  let seat = 0;
  while (used.has(seat)) seat++;
  let unique = name;
  for (let n = 2; s.players.some((p) => p.name.toLowerCase() === unique.toLowerCase()); n++) unique = `${name} ${n}`;
  s.players.push(blankPlayer(id, unique, seat, bot));
  s.version++;
  return null;
}

function blankPlayer(id: string, name: string, seat: number, bot: boolean): Player {
  return {
    id, name, seat, bot, choice: null, role: null, wrecker: false, connected: true,
    x: 0, y: 0, dir: Math.PI / 2, moving: false, mounted: false, carry: [], pearls: 0,
    ready: false, brig: false, busyUntil: 0, lastMoveAt: 0, accused: false, lastDump: -DUMP_COOLDOWN, lastBarter: 0, loadedDiamonds: 0, downUntil: 0, guardUntil: 0, order: null,
  };
}

export function removePlayer(s: GameState, id: string) {
  s.players = s.players.filter((p) => p.id !== id);
  if (s.hostId === id) s.hostId = s.players.find((p) => !p.bot)?.id ?? s.players[0]?.id ?? "";
  s.version++;
}

export function chooseRole(s: GameState, pid: string, role: Role | null): string | null {
  const p = player(s, pid);
  if (!p || s.phase !== "lobby") return null;
  if (role && !ROLES.includes(role)) return "Unknown character.";
  if (role && s.players.some((q) => q.id !== pid && q.choice === role)) return `${ROLE_INFO[role].name} is already taken.`;
  p.choice = role;
  s.version++;
  return null;
}

// ---------- starting ----------

export function startGame(s: GameState, rng: Rng, now: number): string | null {
  if (s.phase !== "lobby" && s.phase !== "over") return "The game is already running.";
  if (s.players.length < MIN_PLAYERS) return "Need at least one player.";
  s.round++;
  s.phase = "play";
  s.totalTides = s.settings.quick ? 3 : 5;
  s.tideMs = s.settings.quick ? QUICK_TIDE_MS : TIDE_MS;
  s.tide = 1;
  s.startedAt = now;
  s.tideStartedAt = now;
  s.endsAt = now + s.totalTides * s.tideMs;
  s.phaseEndsAt = s.tideStartedAt + s.tideMs;
  s.sailAt = null;
  s.crates = [];
  s.piles = [];
  s.hold = [];
  s.offers = [];
  s.vote = null;
  s.lampUntil = 0;
  s.lampTide = 0;
  s.secretFound = false;
  s.caveOpen = false;
  s.diveReady = DIVE_SPOTS.map(() => 0);
  s.closed = [];
  s.log = [];
  s.fx = [];
  s.result = null;

  // Characters: keep what people chose, deal the rest (repeats only beyond six players).
  const taken = new Set(s.players.map((p) => p.choice).filter(Boolean) as Role[]);
  let pool = shuffle(ROLES.filter((r) => !taken.has(r)), rng);
  for (const p of s.players) {
    if (p.choice) p.role = p.choice;
    else {
      if (!pool.length) pool = shuffle(ROLES, rng);
      p.role = pool.pop()!;
    }
  }
  const wreckers = new Set(shuffle(s.players.map((p) => p.id), rng).slice(0, wreckerCount(s)));
  const g = ground(s, now);
  s.players.forEach((p, i) => {
    const spot = nearestFooting(1150 + (i % 4) * 34, 1270 + Math.floor(i / 4) * 34, g);
    Object.assign(p, {
      wrecker: wreckers.has(p.id), x: spot.x, y: spot.y, dir: -Math.PI / 2, moving: false,
      mounted: ROLE_INFO[p.role!].mounted, carry: [], pearls: 2, ready: false, brig: false, busyUntil: 0,
      lastMoveAt: now, accused: false, lastDump: -DUMP_COOLDOWN, lastBarter: 0, loadedDiamonds: 0, downUntil: 0, guardUntil: 0, order: null,
    } satisfies Partial<Player>);
  });

  // Treasures that wait all game: the compass in the palace and a hoard in the sealed cave.
  for (let i = 0; i < 3; i++) s.crates.push({ id: nid(s, "c"), kind: "diamond", x: CAVE.x - 36 + i * 36, y: CAVE.y - 10 + (i % 2) * 14, zone: "cave" });
  s.piles.push({ id: nid(s, "g"), x: CAVE.x, y: CAVE.y + 22, n: 6 });
  dealOrders(s, rng);
  // The island starts well stocked: the first two waves are already waiting.
  spawnTide(s, rng, now, 0);
  spawnTide(s, rng, now, 1);
  log(s, "The tide is turning. Load the ferry and get aboard before the last tide.", "flood");
  if (wreckers.size) log(s, wreckers.size > 1 ? "Two Wreckers are hiding among you." : "A Wrecker is hiding among you.", "alert");
  return null;
}

/** At each tide, everyone whose order is filled (or who has none) gets a new private one;
 *  an unfinished order carries over. Neighbours get different main kinds, so what one person
 *  needs is usually in someone else's hands. */
function dealOrders(s: GameState, rng: Rng) {
  const offset = Math.floor(rng() * 3);
  s.players.forEach((p, i) => {
    if (p.order && !p.order.done) return;
    const main = SUPPLIES[(i + offset) % 3];
    const others = SUPPLIES.filter((k) => k !== main);
    const side = others[Math.floor(rng() * 2)];
    p.order = { want: { [main]: 2, [side]: 1 }, got: {}, reward: ORDER_REWARD, done: false, tide: s.tide };
  });
  s.version++;
}

/** What turns up in each place, by tide: about eight supplies, two diamonds and the odd
 *  cutlass a tide. Low places get theirs early, so they're worth raiding before they drown. */
const SPAWNS: Partial<Record<ZoneId, Kind[]>>[] = [
  { harbour: ["fuel", "tools"], shipwreck: ["diamond", "medicine"], coves: ["medicine"], gardens: ["fuel"], lighthouse: ["cutlass"], market: ["tools"] },
  { coves: ["fuel", "diamond"], harbour: ["medicine"], market: ["fuel", "cutlass"], stables: ["tools"], hotel: ["diamond"], gardens: ["medicine"] },
  { market: ["fuel", "diamond"], gardens: ["tools", "medicine"], lighthouse: ["fuel"], stables: ["cutlass"], hotel: ["tools"], palace: ["diamond"] },
  { gardens: ["medicine", "diamond"], hotel: ["fuel", "tools"], palace: ["medicine", "cutlass"], stables: ["fuel"] },
  { palace: ["fuel", "medicine", "tools"], hotel: ["diamond"], stables: ["fuel"], lighthouse: ["medicine"] },
];

/** About a third of each tide's crates turn up at the start, a third and two thirds of the way through. */
export function spawnList(t: number, part: number): [ZoneId, Kind][] {
  const all: [ZoneId, Kind][] = [];
  for (const [z, kinds] of Object.entries(SPAWNS[t - 1] ?? {}) as [ZoneId, Kind[]][]) for (const k of kinds) all.push([z, k]);
  return all.filter((_, i) => i % WAVES === part);
}

/** When the next wave of crates washes up, or null if none are left this game. */
export function nextWaveAt(s: { tide: number; totalTides: number; tideStartedAt: number; tideMs: number; spawnedPart: number }, now: number): number | null {
  for (let k = s.spawnedPart + 1; k < WAVES; k++) {
    const at = s.tideStartedAt + (s.tideMs * k) / WAVES;
    if (at > now) return at;
  }
  return s.tide < s.totalTides ? s.tideStartedAt + s.tideMs : null;
}

function spawnTide(s: GameState, rng: Rng, now: number, part: number) {
  const g = { ...ground(s, now), level: seaLevel(s.tide, s.tideStartedAt - 1e9, s.totalTides, now) };
  s.spawnedPart = part;
  const places = new Set<string>();
  for (const [z, kind] of spawnList(s.tide, part)) {
    // If its place has already drowned, the crate washes up on high ground instead.
    let at: ZoneId = z;
    let spot = randomSpot(z, g, rng);
    for (const alt of ["stables", "palace"] as ZoneId[]) {
      if (spot) break;
      at = alt;
      spot = randomSpot(alt, g, rng);
    }
    if (!spot) continue;
    const bonus = SUPPLIES.includes(kind as Supply) && rng() < 0.3 ? 1 : undefined;
    s.crates.push({ id: nid(s, "c"), kind, x: spot.x, y: spot.y, zone: at, ...(bonus ? { bonus } : {}) });
    places.add(ZONES[at].name);
  }
  // A few more supplies wash up anywhere still dry.
  const dryZones = ZONE_IDS.filter((z) => z !== "caves" && depthAt(ZONES[z].x, ZONES[z].y, g.level + 0.3) <= 0);
  for (let i = 0; i < 1 && dryZones.length; i++) {
    const z = dryZones[Math.floor(rng() * dryZones.length)];
    const spot = randomSpot(z, g, rng);
    if (spot) s.crates.push({ id: nid(s, "c"), kind: SUPPLIES[Math.floor(rng() * 3)], x: spot.x, y: spot.y, zone: z });
  }
  // And every person gets a crate of their own nearby, so the bots can't take everything.
  // It's something another player's order needs, so it's worth trading.
  for (const p of s.players) {
    if (p.bot || !p.connected || p.brig || s.phase !== "play") continue;
    if (s.crates.filter((c) => c.owner === p.id).length >= 3) continue;
    const kind = tradeBait(s, p, rng);
    const base = outdoorPos(p.x, p.y);
    const spot = spotNear(base.x, base.y, g, rng);
    if (spot) s.crates.push({ id: nid(s, "c"), kind, x: spot.x, y: spot.y, zone: zoneAt(spot.x, spot.y) ?? "dropped", owner: p.id });
  }
  // Pearls wash up wherever the land is still dry.
  const dry = ZONE_IDS.filter((z) => z !== "caves" && z !== "hotel" && depthAt(ZONES[z].x, ZONES[z].y, g.level + 0.3) <= 0);
  const piles = part === 0 ? 3 : 2;
  for (let i = 0; i < piles && dry.length; i++) {
    const spot = randomSpot(dry[Math.floor(rng() * dry.length)], g, rng);
    if (spot) s.piles.push({ id: nid(s, "g"), x: spot.x, y: spot.y, n: 1 + Math.floor(rng() * 3) });
  }
  if (part === 0) {
    s.marketStock = 3;
    stockBuildings(s, rng, g.level);
  }
  const names = [...places];
  if (names.length) {
    fx(s, "wave", 0, 0);
    log(s, `Fresh crates washed up at ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]}.`, "info");
  }
  s.version++;
}

/** What a person's own crate holds: a supply someone else's order wants and theirs doesn't. */
function tradeBait(s: GameState, p: Player, rng: Rng): Supply {
  const wants = (q: Player) => (q.order && !q.order.done ? SUPPLIES.filter((k) => (q.order!.want[k] ?? 0) > (q.order!.got[k] ?? 0)) : []);
  const mine = wants(p);
  const theirs = s.players.filter((q) => q.id !== p.id).flatMap(wants).filter((k) => !mine.includes(k));
  const pool = theirs.length ? theirs : SUPPLIES.filter((k) => !mine.includes(k));
  return (pool.length ? pool : SUPPLIES)[Math.floor(rng() * (pool.length || 3))];
}

/** What each building holds: one thing, restocked every other tide while it stays dry. */
const INDOORS: Record<BuildingId, (tide: number, rng: Rng) => Kind[]> = {
  hospital: () => ["medicine"],
  palace: (t) => (t === 1 ? ["compass"] : ["diamond"]),
  hotel: (t) => (t === 3 ? ["diamond"] : ["tools"]),
  lighthouse: () => ["fuel"],
  stables: () => ["tools"],
  shipwreck: () => ["diamond"],
  market: (_t, rng) => [SUPPLIES[Math.floor(rng() * 3)]],
};

function stockBuildings(s: GameState, rng: Rng, level: number) {
  if (s.tide % 2 === 0) return;
  for (const b of BUILDINGS) {
    if (s.closed.includes(b.id) || !buildingOpen(b, level)) continue;
    const free = b.spots.filter((sp) => !s.crates.some((c) => dist(c.x, c.y, sp.x, sp.y) < 24));
    for (const kind of INDOORS[b.id](s.tide, rng)) {
      // The compass only turns up once.
      if (kind === "compass" && (s.crates.some((c) => c.kind === "compass") || s.players.some((p) => p.carry.some((c) => c.kind === "compass")) || s.hold.some((c) => c.kind === "compass"))) continue;
      const sp = free.shift();
      if (!sp) break;
      s.crates.push({ id: nid(s, "c"), kind, x: sp.x, y: sp.y, zone: "indoors" });
    }
    if ((b.id === "market" || b.id === "hotel") && !s.piles.some((pl) => buildingAt(pl.x, pl.y) === b)) {
      const r = b.room;
      s.piles.push({ id: nid(s, "g"), x: r.x1 + (r.x2 - r.x1) * 0.75, y: r.y1 + (r.y2 - r.y1) * 0.66, n: 2 });
    }
  }
}

/** Step inside the building whose door you're at. */
export function enterBuilding(s: GameState, pid: string, now: number): string | null {
  const p = player(s, pid);
  if (!p || s.phase !== "play" || p.brig || now < p.downUntil) return null;
  const b = nearDoor(p);
  if (!b) return "Walk up to a door first.";
  if (s.closed.includes(b.id) || !buildingOpen(b, levelNow(s, now))) return `The sea has flooded ${b.name}.`;
  const at = insideDoor(b);
  Object.assign(p, { x: at.x, y: at.y, dir: -Math.PI / 2, moving: false, lastMoveAt: now });
  s.version++;
  return null;
}

/** Go back out through the door. */
export function leaveBuilding(s: GameState, pid: string, now: number): string | null {
  const p = player(s, pid);
  if (!p || s.phase !== "play" || p.brig) return null;
  const b = buildingAt(p.x, p.y);
  if (!b) return null;
  const at = nearestFooting(b.door.x, b.door.y + 26, ground(s, now));
  Object.assign(p, { x: at.x, y: at.y, dir: Math.PI / 2, moving: false, lastMoveAt: now });
  s.version++;
  return null;
}

/** Somewhere dry a short walk from (x, y). */
function spotNear(x: number, y: number, g: Ground, rng: Rng) {
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = 180 + rng() * 260;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (px < 40 || py < 40 || px > W - 40 || py > H - 40) continue;
    if (footing(px, py, g) >= 1 && !onDock(px, py) && depthAt(px, py, g.level + 0.6) <= 0) return { x: px, y: py };
  }
  return null;
}

function randomSpot(z: ZoneId, g: Ground, rng: Rng) {
  const zone = ZONES[z];
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * zone.r * 0.8;
    const x = zone.x + Math.cos(a) * r;
    const y = zone.y + Math.sin(a) * r;
    if (footing(x, y, g) >= 1 && !onDock(x, y) && depthAt(x, y, g.level + 0.3) <= 0) return { x, y };
  }
  return null;
}

// ---------- the clock ----------

/** Advance the world. Returns true if anything other than positions changed. */
export function tick(s: GameState, now: number, rng: Rng): boolean {
  const v = s.version;
  if (s.phase === "play") {
    // Next tide: the water rises and another band of the island goes under.
    while (now >= s.tideStartedAt + s.tideMs) {
      if (s.tide >= s.totalTides) {
        sail(s, now, false);
        return true;
      }
      s.tide++;
      s.tideStartedAt += s.tideMs;
      s.phaseEndsAt = s.tideStartedAt + s.tideMs;
      const drowned = ZONE_IDS.filter((z) => depthAt(ZONES[z].x, ZONES[z].y, seaLevel(s.tide, 0, s.totalTides, now)) > 0 && depthAt(ZONES[z].x, ZONES[z].y, seaLevel(s.tide - 1, 0, s.totalTides, now)) <= 0);
      fx(s, "tide", 0, 0);
      log(s, `Tide ${s.tide} of ${s.totalTides} is rising${drowned.length ? `: ${drowned.map((z) => ZONES[z].name).join(" and ")} ${drowned.length > 1 ? "are" : "is"} going under` : ""}.`, "flood");
      if (s.tide === s.totalTides) log(s, "Last tide. The ferry leaves when it runs out. Be on the pier.", "alert");
      spawnTide(s, rng, now, 0);
      dealOrders(s, rng);
    }
    const wave = Math.min(WAVES - 1, Math.floor(((now - s.tideStartedAt) * WAVES) / s.tideMs));
    while (s.spawnedPart < wave) spawnTide(s, rng, now, s.spawnedPart + 1);
    const g = ground(s, now);
    // Crates and pearls that go under are lost; people caught in deep water scramble ashore.
    const before = s.crates.length;
    s.crates = s.crates.filter((c) => {
      if (c.zone === "cave" || depthAt(c.x, c.y, g.level) < 0.3) return true;
      fx(s, "sink", c.x, c.y);
      return false;
    });
    if (s.crates.length !== before) s.version++;
    s.piles = s.piles.filter((p) => depthAt(p.x, p.y, g.level) < 0.3 || dist(p.x, p.y, CAVE.x, CAVE.y) < CAVE.r);
    // When the sea reaches a door, the building floods: everything inside is lost, people wash out.
    for (const b of BUILDINGS) {
      if (s.closed.includes(b.id) || buildingOpen(b, g.level)) continue;
      s.closed.push(b.id);
      s.crates = s.crates.filter((c) => buildingAt(c.x, c.y) !== b);
      s.piles = s.piles.filter((pl) => buildingAt(pl.x, pl.y) !== b);
      for (const p of s.players) {
        if (buildingAt(p.x, p.y) !== b) continue;
        const to = nearestFooting(b.door.x, b.door.y, g);
        p.x = to.x;
        p.y = to.y;
        fx(s, "swept", p.x, p.y, p.id);
      }
      log(s, `The sea poured into ${b.name}. It's closed for good.`, "flood");
    }
    for (const p of s.players) {
      if (p.brig) continue;
      if (footing(p.x, p.y, g) <= 0) {
        const to = nearestFooting(p.x, p.y, g);
        p.x = to.x;
        p.y = to.y;
        fx(s, "swept", p.x, p.y, p.id);
      }
      if (p.downUntil && now >= p.downUntil) {
        p.downUntil = 0;
        s.version++;
      }
      collect(s, p, now);
      if (nearGangway(p) && p.carry.length && !p.downUntil) loadAll(s, p);
      if (p.ready && !onDock(p.x, p.y)) {
        p.ready = false;
        s.version++;
      }
      if (!s.caveOpen && p.carry.some((c) => c.kind === "compass") && dist(p.x, p.y, CAVE_DOOR.x, CAVE_DOOR.y) < 70) {
        s.caveOpen = true;
        fx(s, "gate", CAVE_DOOR.x, CAVE_DOOR.y, p.id);
        log(s, `${p.name} turned the compass in the cave door. The Sapphire Caves are open.`, "info");
      }
    }
    // Offers nobody answers fade away after a while.
    for (const o of s.offers) {
      if (o.status === "open" && now - o.at > OFFER_MS) {
        o.status = "cancelled";
        s.version++;
      }
    }
    if (s.offers.length > 40) s.offers = s.offers.filter((o) => o.status === "open" || now - o.at < 60_000);
    if (s.vote && s.vote.outcome === "open") settleVote(s, now, false);
    // Enough people ready on the pier: start the countdown.
    const ready = s.players.filter((p) => p.ready || p.brig).length;
    const wantSail = ready * 2 > s.players.length;
    if (wantSail && s.sailAt === null) {
      s.sailAt = now + SAIL_COUNTDOWN;
      log(s, "Most of you are ready. The ferry sails in 15 seconds. Run for the pier!", "alert");
    } else if (!wantSail && s.sailAt !== null) {
      s.sailAt = null;
      log(s, "Departure called off. Not enough people are ready.", "info");
    }
    if (s.sailAt !== null && now >= s.sailAt) sail(s, now, true);
  } else if (s.phase === "sailing" && s.phaseEndsAt && now >= s.phaseEndsAt) {
    s.phase = "over";
    s.phaseEndsAt = null;
    s.version++;
  }
  return s.version !== v;
}

/** Bots leave crates that a person is close to, so people always have something to find.
 *  In the last tide they stop holding back and fetch whatever the ferry still needs. */
export function savedForPeople(s: GameState, p: Player, c: { x: number; y: number }, now: number): boolean {
  if (!p.bot || p.wrecker || s.endsAt - now < s.tideMs) return false;
  return s.players.some((q) => {
    if (q.bot || !q.connected || q.brig) return false;
    const at = outdoorPos(q.x, q.y);
    const d = dist(at.x, at.y, c.x, c.y);
    return d < 550 || d < dist(p.x, p.y, c.x, c.y);
  });
}

function collect(s: GameState, p: Player, now: number) {
  if (now < p.busyUntil) return;
  for (const pile of s.piles) {
    if (dist(p.x, p.y, pile.x, pile.y) < PICKUP_R) {
      p.pearls += pile.n;
      pile.n = 0;
      fx(s, "pickup", pile.x, pile.y, p.id, "pearl");
    }
  }
  s.piles = s.piles.filter((x) => x.n > 0);
  if (p.carry.length >= carryLimit(p)) return;
  const i = s.crates.findIndex((c) => dist(p.x, p.y, c.x, c.y) < PICKUP_R && (!c.owner || c.owner === p.id) && !savedForPeople(s, p, c, now));
  if (i < 0) return;
  const c = s.crates[i];
  s.crates.splice(i, 1);
  p.carry.push({ id: c.id, kind: c.kind });
  if (p.role === "duchess" && c.zone !== "dropped") p.pearls++;
  if (c.bonus) p.pearls += c.bonus;
  fx(s, "pickup", c.x, c.y, p.id, c.kind);
  if (c.kind === "cutlass") log(s, `${p.name} picked up a cutlass.`, "alert");
  if (c.kind === "compass") log(s, `${p.name} found the Antique Compass.`, "info");
  if (c.kind === "diamond" && c.zone !== "dropped") log(s, `${p.name} found a diamond ${c.zone === "cave" ? "at the Sapphire Caves" : c.zone === "indoors" ? `in ${buildingAt(c.x, c.y)?.name ?? "a building"}` : `at ${ZONES[c.zone as ZoneId].name}`}.`, "info");
}

function loadAll(s: GameState, p: Player) {
  const loaded: string[] = [];
  let spare = 0;
  for (const item of [...p.carry]) {
    if (item.kind === "cutlass") continue; // you keep your weapon
    if (!worthLoading(s, item.kind)) continue;
    const isSpare = s.hold.length >= goalOf(s);
    p.carry = p.carry.filter((c) => c.id !== item.id);
    s.hold.push({ ...item, owner: p.id });
    if (item.kind === "diamond") p.loadedDiamonds++;
    if (isSpare) spare++;
    loaded.push(KIND_INFO[item.kind].name.toLowerCase());
    const o = p.order;
    const k = item.kind as Supply;
    if (o && !o.done && (o.want[k] ?? 0) > (o.got[k] ?? 0)) {
      o.got[k] = (o.got[k] ?? 0) + 1;
      if (SUPPLIES.every((q) => (o.got[q] ?? 0) >= (o.want[q] ?? 0))) {
        o.done = true;
        p.pearls += o.reward;
        fx(s, "barter", GANGWAY.x, GANGWAY.y, p.id);
        log(s, `${p.name} filled a passenger's order: +${o.reward} pearls.`, "trade");
      }
    }
  }
  if (loaded.length) {
    p.pearls += spare * SPARE_PEARLS;
    fx(s, "load", GANGWAY.x, GANGWAY.y, p.id);
    log(s, `${p.name} loaded ${loaded.join(", ")}${spare ? ` (+${spare * SPARE_PEARLS} pearls for spares)` : ""}.`, "load");
  }
}

/** The hold keeps room for what the crossing still needs. */
export function worthLoading(_s: GameState, kind: Kind) {
  return kind !== "cutlass";
}

function sail(s: GameState, now: number, early: boolean) {
  s.phase = "sailing";
  s.phaseEndsAt = now + SAIL_MS;
  s.sailAt = null;
  for (const o of s.offers) if (o.status === "open") o.status = "cancelled";
  const loaded = s.hold.length;
  const goal = goalOf(s);
  const success = loaded >= goal;
  const wreckers = s.players.filter((p) => p.wrecker).map((p) => p.id);
  const fortunes = s.players.map((p) => {
    const aboard = p.brig || onDock(p.x, p.y);
    const carried = p.carry.filter((c) => c.kind === "diamond").length;
    const diamonds = p.loadedDiamonds + (aboard ? carried : 0);
    const pearls = aboard ? p.pearls : 0;
    return { id: p.id, fortune: success && aboard ? diamonds * KIND_INFO.diamond.worth + pearls : 0, diamonds, pearls, aboard };
  });
  const best = Math.max(0, ...fortunes.filter((f) => !s.players.find((p) => p.id === f.id)?.wrecker).map((f) => f.fortune));
  s.result = {
    success,
    loaded,
    goal,
    winners: success ? "islanders" : wreckers.length ? "wrecker" : "nobody",
    fortunes: fortunes.sort((a, b) => b.fortune - a.fortune),
    grandFortune: success && best > 0 ? fortunes.filter((f) => f.fortune === best && !s.players.find((p) => p.id === f.id)?.wrecker).map((f) => f.id) : [],
    wreckers,
    early,
  };
  const left = fortunes.filter((f) => !f.aboard).map((f) => player(s, f.id)!.name);
  log(s, `The ferry casts off${left.length ? `, leaving ${left.join(", ")} behind` : " with everyone aboard"}.`, "alert");
  s.version++;
}

// ---------- movement ----------

/** A position report from a player's device. The server checks speed and footing. */
export function moveTo(s: GameState, pid: string, x: number, y: number, dir: number, moving: boolean, now: number): boolean {
  const p = player(s, pid);
  if (!p || s.phase !== "play" || p.brig || now < p.busyUntil) return false;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const dt = Math.min(1, Math.max(0.05, (now - p.lastMoveAt) / 1000));
  const max = speedOf(p) * dt * 1.6 + 24;
  const g = ground(s, now);
  if (dist(p.x, p.y, x, y) > max || footing(x, y, g) <= 0) return false;
  p.x = x;
  p.y = y;
  p.dir = Number.isFinite(dir) ? dir : p.dir;
  p.moving = moving;
  p.lastMoveAt = now;
  return true;
}

// ---------- things you can do ----------

export function dropItem(s: GameState, pid: string, itemId: string, now: number): string | null {
  const p = player(s, pid);
  if (!p || s.phase !== "play") return null;
  const item = p.carry.find((c) => c.id === itemId);
  if (!item) return "You're not carrying that.";
  p.carry = p.carry.filter((c) => c.id !== itemId);
  // Set it down just behind you so you don't pick it straight back up.
  const g = ground(s, now);
  const at = nearestFooting(p.x - Math.cos(p.dir) * 40, p.y - Math.sin(p.dir) * 40, g);
  s.crates.push({ ...item, x: at.x, y: at.y, zone: "dropped" });
  p.busyUntil = now + 600;
  s.version++;
  return null;
}

export function toggleMount(s: GameState, pid: string): string | null {
  const p = player(s, pid);
  if (!p || s.phase !== "play") return null;
  if (!p.mounted && !nearStables(p)) return "Horses are saddled at the Royal Stables.";
  p.mounted = !p.mounted;
  fx(s, "horse", p.x, p.y, p.id);
  return null;
}

export function dive(s: GameState, pid: string, now: number): string | null {
  const p = player(s, pid);
  if (!p || s.phase !== "play") return null;
  const i = nearDive(p);
  if (i < 0) return "Find a diving buoy at the Turquoise Coves.";
  if (now < s.diveReady[i]) return `The oyster bed is picked clean for now. Try again in ${Math.ceil((s.diveReady[i] - now) / 1000)}s.`;
  const n = p.role === "diver" ? 4 : 2;
  p.busyUntil = now + DIVE_MS;
  p.moving = false;
  p.pearls += n;
  s.diveReady[i] = now + 20_000;
  fx(s, "dive", DIVE_SPOTS[i].x, DIVE_SPOTS[i].y, p.id);
  log(s, `${p.name} dived and came up with ${n} pearls.`, "info");
  return null;
}

export function barter(s: GameState, pid: string, kind: Supply, now: number, rng: Rng): string | null {
  const p = player(s, pid);
  if (!p || s.phase !== "play") return null;
  if (!nearStall(p)) return "Walk up to the Pearl Market stall to barter.";
  if (!SUPPLIES.includes(kind)) return "The merchant only sells supplies.";
  if (s.marketStock <= 0) return "The merchant is sold out until the next tide.";
  if (p.pearls < BARTER_COST) return `The merchant wants ${BARTER_COST} pearls.`;
  if (p.carry.length >= carryLimit(p)) return "Your hands are full. Load the ferry first.";
  if (now - p.lastBarter < 5000) return "The merchant is still counting your last pearls.";
  p.lastBarter = now;
  if (p.role !== "jeweler" && rng() < 0.3) {
    s.version++;
    return "The merchant shakes his head at your price. Try again in a moment.";
  }
  p.pearls -= BARTER_COST;
  s.marketStock--;
  p.carry.push({ id: nid(s, "c"), kind });
  fx(s, "barter", MARKET_STALL.x, MARKET_STALL.y, p.id);
  log(s, `${p.name} bartered pearls for ${KIND_INFO[kind].name.toLowerCase()}.`, "trade");
  return null;
}

export function lightLamp(s: GameState, pid: string, now: number): string | null {
  const p = player(s, pid);
  if (!p || s.phase !== "play") return null;
  if (!nearLamp(p)) return "Climb up to the lighthouse lamp first.";
  if (s.lampTide === s.tide) return "The lamp has already been lit this tide.";
  s.lampTide = s.tide;
  s.lampUntil = now + 45_000;
  const first = !s.secretFound;
  s.secretFound = true;
  fx(s, "lamp", LAMP.x, LAMP.y, p.id);
  log(s, `${p.name} lit the lighthouse. Every crate on the island shows on the map${first ? ", and a hidden stone path appeared across the water" : ""}.`, "info");
  return null;
}

export function dump(s: GameState, pid: string, now: number, rng: Rng): string | null {
  const p = player(s, pid);
  if (!p || s.phase !== "play" || !p.wrecker || p.brig) return null;
  if (!nearGangway(p)) return "Get to the gangway first.";
  if (now - p.lastDump < DUMP_COOLDOWN) return `Too risky. Wait ${Math.ceil((DUMP_COOLDOWN - (now - p.lastDump)) / 1000)}s.`;
  const supplies = s.hold.filter((c) => SUPPLIES.includes(c.kind as Supply));
  if (!supplies.length) return "There's nothing aboard worth sinking yet.";
  const victim = supplies[Math.floor(rng() * supplies.length)];
  s.hold = s.hold.filter((c) => c.id !== victim.id);
  p.lastDump = now;
  fx(s, "splash", GANGWAY.x + 30, GANGWAY.y + 40);
  log(s, `Splash! A crate of ${KIND_INFO[victim.kind].name.toLowerCase()} went over the side of the ferry.`, "alert");
  return null;
}

/** Strike someone next to you with a cutlass: they're knocked out and drop what they carry. */
export function strike(s: GameState, pid: string, target: string, now: number): string | null {
  const p = player(s, pid);
  const t = player(s, target);
  if (!p || !t || s.phase !== "play" || pid === target) return null;
  if (p.brig || now < p.busyUntil) return null;
  const blade = p.carry.find((c) => c.kind === "cutlass");
  if (!blade) return "You need a cutlass. They turn up in crates.";
  if (t.brig) return `${t.name} is in the brig.`;
  if (dist(p.x, p.y, t.x, t.y) > STRIKE_R) return `Get right up to ${t.name} first.`;
  if (now < t.downUntil) return `${t.name} is already knocked out.`;
  if (now < t.guardUntil) return `${t.name} is on guard after the last hit. Wait ${Math.ceil((t.guardUntil - now) / 1000)}s.`;
  p.carry = p.carry.filter((c) => c.id !== blade.id);
  t.downUntil = now + KNOCKOUT_MS;
  t.guardUntil = t.downUntil + GUARD_MS;
  t.busyUntil = Math.max(t.busyUntil, t.downUntil);
  t.moving = false;
  t.ready = false;
  // Everything they carried spills on the ground around them.
  const g = ground(s, now);
  t.carry.forEach((item, i) => {
    const a = (i / Math.max(1, t.carry.length)) * Math.PI * 2 + 0.6;
    const at = nearestFooting(t.x + Math.cos(a) * 34, t.y + Math.sin(a) * 20, g);
    s.crates.push({ ...item, x: at.x, y: at.y, zone: "dropped" });
  });
  const spilled = t.carry.length;
  t.carry = [];
  fx(s, "strike", t.x, t.y, p.id);
  log(s, `${p.name} knocked out ${t.name} with a cutlass${spilled ? ` and ${spilled > 1 ? `${spilled} crates` : "a crate"} spilled` : ""}!`, "alert");
  return null;
}

export function setReady(s: GameState, pid: string, ready: boolean): string | null {
  const p = player(s, pid);
  if (!p || s.phase !== "play") return null;
  if (ready && !onDock(p.x, p.y)) return "Stand on the pier to call for departure.";
  p.ready = ready;
  s.version++;
  return null;
}

// ---------- accusations ----------

export function accuse(s: GameState, pid: string, target: string, now: number): string | null {
  const p = player(s, pid);
  const t = player(s, target);
  if (!p || !t || s.phase !== "play" || pid === target) return null;
  if (!wreckerCount(s)) return "There is no Wrecker this game.";
  if (p.brig) return "You're locked in the brig.";
  if (p.accused) return "You've already made your accusation this game.";
  if (s.vote?.outcome === "open") return "Finish the current vote first.";
  if (t.brig) return `${t.name} is already in the brig.`;
  p.accused = true;
  s.vote = { id: nid(s, "v"), target, by: pid, yes: [pid], no: [], endsAt: now + 25_000, outcome: "open" };
  log(s, `${p.name} accuses ${t.name} of being the Wrecker. Everyone votes.`, "alert");
  return null;
}

export function castVote(s: GameState, pid: string, yes: boolean, now: number): string | null {
  const v = s.vote;
  const p = player(s, pid);
  if (!v || v.outcome !== "open" || !p || p.brig || pid === v.target) return null;
  v.yes = v.yes.filter((x) => x !== pid);
  v.no = v.no.filter((x) => x !== pid);
  (yes ? v.yes : v.no).push(pid);
  s.version++;
  settleVote(s, now, false);
  return null;
}

function settleVote(s: GameState, now: number, force: boolean) {
  const v = s.vote!;
  const voters = s.players.filter((p) => !p.brig && p.id !== v.target && (p.connected || p.bot));
  const need = Math.floor(voters.length / 2) + 1;
  const done = v.yes.length >= need || v.no.length > voters.length - need || v.yes.length + v.no.length >= voters.length;
  if (!done && !force && now < v.endsAt) return;
  const t = player(s, v.target)!;
  if (v.yes.length >= need) {
    v.outcome = "jailed";
    t.brig = true;
    t.ready = false;
    t.moving = false;
    // Their cargo is confiscated and left on the pier.
    for (const item of t.carry) s.crates.push({ ...item, x: 1250 + (Math.random() - 0.5) * 40, y: 1400 + Math.random() * 40, zone: "dropped" });
    t.carry = [];
    t.x = 1300;
    t.y = 1520;
    fx(s, "brig", t.x, t.y, t.id);
    log(s, `${t.name} is locked in the ferry's brig. ${t.wrecker ? "They WERE a Wrecker!" : "They were innocent."}`, "alert");
  } else {
    v.outcome = "freed";
    log(s, `Not enough votes. ${t.name} stays free.`, "info");
  }
  s.version++;
}

// ---------- trading face to face ----------

export const MAX_OPEN_OFFERS = 2;

export function makeOffer(s: GameState, from: string, to: string, give: Offer["give"], want: Offer["want"], now: number): string | null {
  const a = player(s, from);
  const b = player(s, to);
  if (!a || !b || from === to || s.phase !== "play") return "You can't trade with them.";
  if (a.brig || b.brig) return "No trading through the brig bars.";
  const ids = Array.isArray(give?.itemIds) ? [...new Set(give.itemIds.map(String))] : [];
  const items = ids.map((id) => a.carry.find((c) => c.id === id));
  if (items.some((c) => !c)) return "You're not carrying all of that.";
  const pearls = Math.max(0, Math.floor(Number(give?.pearls) || 0));
  if (pearls > a.pearls) return "You don't have that many pearls.";
  const kinds: Partial<Record<Kind, number>> = {};
  for (const k of KINDS) {
    const n = Math.max(0, Math.min(4, Math.floor(Number(want?.kinds?.[k]) || 0)));
    if (n) kinds[k] = n;
  }
  const wantPearls = Math.max(0, Math.min(50, Math.floor(Number(want?.pearls) || 0)));
  if (!items.length && !pearls && !Object.keys(kinds).length && !wantPearls) return "Add something to the offer.";
  if (s.offers.filter((o) => o.from === from && o.status === "open").length >= MAX_OPEN_OFFERS) return "You already have offers waiting. Cancel one first.";
  s.offers.push({ id: nid(s, "o"), from, to, give: { itemIds: ids, pearls }, want: { kinds, pearls: wantPearls }, giveItems: items as Item[], status: "open", at: now });
  if (s.offers.length > 30) s.offers.splice(0, s.offers.length - 30);
  s.version++;
  return null;
}

export function cancelOffer(s: GameState, pid: string, offerId: string): string | null {
  const o = s.offers.find((x) => x.id === offerId);
  if (!o || o.from !== pid || o.status !== "open") return null;
  o.status = "cancelled";
  s.version++;
  return null;
}

export function respondOffer(s: GameState, pid: string, offerId: string, accept: boolean): string | null {
  const o = s.offers.find((x) => x.id === offerId);
  if (!o || o.to !== pid || o.status !== "open") return "That offer is no longer open.";
  if (!accept) {
    o.status = "declined";
    s.version++;
    return null;
  }
  const a = player(s, o.from)!;
  const b = player(s, o.to)!;
  const giveItems = o.give.itemIds.map((id) => a.carry.find((c) => c.id === id));
  if (giveItems.some((c) => !c) || a.pearls < o.give.pearls) {
    o.status = "failed";
    s.version++;
    return `${a.name} no longer has what they offered.`;
  }
  // Pick the requested items from what the responder is carrying.
  const takeFromB: Item[] = [];
  for (const [k, n] of Object.entries(o.want.kinds) as [Kind, number][]) {
    const have = b.carry.filter((c) => c.kind === k && !takeFromB.includes(c));
    if (have.length < n) return `You need ${n} ${KIND_INFO[k].name.toLowerCase()} to accept.`;
    takeFromB.push(...have.slice(0, n));
  }
  if (b.pearls < o.want.pearls) return `You need ${o.want.pearls} pearls to accept.`;
  if (b.carry.length - takeFromB.length + giveItems.length > carryLimit(b)) return "Your hands would be too full. Load or drop something first.";
  if (a.carry.length - giveItems.length + takeFromB.length > carryLimit(a)) return `${a.name}'s hands would be too full.`;
  a.carry = a.carry.filter((c) => !o.give.itemIds.includes(c.id)).concat(takeFromB);
  b.carry = b.carry.filter((c) => !takeFromB.includes(c)).concat(giveItems as Item[]);
  a.pearls += o.want.pearls - o.give.pearls;
  b.pearls += o.give.pearls - o.want.pearls;
  o.status = "accepted";
  // Other offers that relied on the same items can no longer go through.
  for (const x of s.offers) {
    if (x.status !== "open") continue;
    const p = player(s, x.from)!;
    if (x.give.itemIds.some((id) => !p.carry.some((c) => c.id === id))) x.status = "failed";
  }
  fx(s, "trade", (a.x + b.x) / 2, (a.y + b.y) / 2, a.id);
  log(s, `${a.name} and ${b.name} made a trade.`, "trade");
  return null;
}

// ---------- what each player sees ----------

export interface PlayerView {
  id: string;
  name: string;
  seat: number;
  choice: Role | null;
  role: Role | null;
  bot: boolean;
  connected: boolean;
  x: number;
  y: number;
  dir: number;
  moving: boolean;
  mounted: boolean;
  carry: Item[];
  pearls: number;
  ready: boolean;
  brig: boolean;
  busyUntil: number;
  downUntil: number;
  guardUntil: number;
  accused: boolean;
  /** Your own order only (everyone's after the game). */
  order?: Order | null;
  /** Only shown to fellow Wreckers, to someone caught in a vote, and after the game. */
  wrecker?: boolean;
  lastDump?: number;
}

export interface GameView {
  code: string;
  you: string;
  hostId: string;
  phase: Phase;
  settings: Settings;
  round: number;
  tide: number;
  totalTides: number;
  tideMs: number;
  tideStartedAt: number;
  endsAt: number;
  sailAt: number | null;
  phaseEndsAt: number | null;
  players: PlayerView[];
  crates: Crate[];
  piles: PearlPile[];
  hold: HoldItem[];
  slots: number;
  capacity: number;
  /** Crates aboard, and how many the crossing needs. */
  goal: number;
  loaded: number;
  offers: Offer[];
  vote: Vote | null;
  lampUntil: number;
  lampTide: number;
  secretFound: boolean;
  caveOpen: boolean;
  closed: BuildingId[];
  marketStock: number;
  diveReady: number[];
  spawnedPart: number;
  log: LogEntry[];
  fx: Fx[];
  result: Result | null;
  wreckerCount: number;
  serverTime?: number;
}

export function viewFor(s: GameState, pid: string): GameView {
  const me = player(s, pid);
  const over = s.phase === "sailing" || s.phase === "over";
  const knowsWreckers = !!me?.wrecker;
  return {
    code: s.code,
    you: pid,
    hostId: s.hostId,
    phase: s.phase,
    settings: s.settings,
    round: s.round,
    tide: s.tide,
    totalTides: s.totalTides,
    tideMs: s.tideMs,
    tideStartedAt: s.tideStartedAt,
    endsAt: s.endsAt,
    sailAt: s.sailAt,
    phaseEndsAt: s.phaseEndsAt,
    players: s.players.map((p) => {
      const showWrecker = over || p.id === pid || (knowsWreckers && p.wrecker) || p.brig;
      return {
        id: p.id, name: p.name, seat: p.seat, choice: p.choice, role: p.role, bot: p.bot, connected: p.connected,
        x: Math.round(p.x), y: Math.round(p.y), dir: p.dir, moving: p.moving, mounted: p.mounted,
        carry: p.carry, pearls: p.pearls, ready: p.ready, brig: p.brig, busyUntil: p.busyUntil, downUntil: p.downUntil, guardUntil: p.guardUntil, accused: p.accused,
        ...(showWrecker ? { wrecker: p.wrecker } : {}),
        ...(p.id === pid && p.wrecker ? { lastDump: p.lastDump } : {}),
        ...(p.id === pid || over ? { order: p.order } : {}),
      };
    }),
    crates: s.crates,
    piles: s.piles,
    hold: s.hold,
    slots: slotsUsed(s.hold),
    capacity: capacityOf(s),
    goal: goalOf(s),
    loaded: s.hold.length,
    offers: s.offers.filter((o) => o.from === pid || o.to === pid),
    vote: s.vote,
    lampUntil: s.lampUntil,
    lampTide: s.lampTide,
    secretFound: s.secretFound,
    caveOpen: s.caveOpen,
    closed: s.closed,
    marketStock: s.marketStock,
    diveReady: s.diveReady,
    spawnedPart: s.spawnedPart,
    log: s.log.slice(-12),
    fx: s.fx,
    result: s.result,
    wreckerCount: wreckerCount(s),
  };
}

/** Where the pier is, for messages and bots. */
export const PIER = { x: (DOCK.x1 + DOCK.x2) / 2, y: DOCK.y2 - 20 };
