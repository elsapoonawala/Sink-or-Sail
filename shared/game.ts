// The Last Ferry: rules engine for the open-world island. Pure game logic shared by the
// server (authoritative) and the client (types and helpers). The server owns the only
// real GameState, runs tick() ten times a second, and sends each player viewFor().

import {
  CAVE, CAVE_DOOR, DIVE_SPOTS, DOCK, GANGWAY, LAMP, MARKET_STALL, QUICK_TIDE_MS, STABLE_POS, TIDE_MS,
  ZONES, ZONE_IDS, type Ground, type ZoneId, depthAt, footing, nearestFooting, onDock, seaLevel,
} from "./world";

export type Supply = "fuel" | "medicine" | "tools";
export type Kind = Supply | "diamond" | "compass";
export type Role = "diver" | "engineer" | "physician" | "cartographer" | "jeweler" | "duchess";
export type Phase = "lobby" | "play" | "sailing" | "over";

export const SUPPLIES: Supply[] = ["fuel", "medicine", "tools"];
export const KINDS: Kind[] = ["fuel", "medicine", "tools", "diamond", "compass"];
export const ROLES: Role[] = ["diver", "engineer", "physician", "cartographer", "jeweler", "duchess"];

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 8;
/** What the crossing needs, and how big the hold is, for a full game and a quick one. */
export const NEEDS: Record<Supply, number> = { fuel: 6, medicine: 5, tools: 4 };
export const QUICK_NEEDS: Record<Supply, number> = { fuel: 4, medicine: 3, tools: 2 };
export const HOLD_SLOTS = 20;
export const QUICK_HOLD_SLOTS = 12;

export const WALK_SPEED = 150;
export const RIDE_SPEED = 265;
export const CARTO_SPEED = 330;
export const PICKUP_R = 30;
export const TRADE_R = 110;
export const BARTER_COST = 3;
export const DUMP_COOLDOWN = 45_000;
export const SAIL_COUNTDOWN = 15_000;
export const SAIL_MS = 7_000;
export const DIVE_MS = 2_500;

export const KIND_INFO: Record<Kind, { name: string; slots: number; worth: number }> = {
  fuel: { name: "Fuel", slots: 1, worth: 0 },
  medicine: { name: "Medicine", slots: 1, worth: 0 },
  tools: { name: "Tools", slots: 1, worth: 0 },
  diamond: { name: "Diamond", slots: 2, worth: 3 },
  compass: { name: "Antique Compass", slots: 1, worth: 0 },
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
  zone: ZoneId | "cave" | "dropped";
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
  kind: "pickup" | "load" | "splash" | "dive" | "lamp" | "gate" | "sink" | "swept" | "barter" | "horse" | "trade" | "tide" | "brig";
  x: number;
  y: number;
  by?: string;
}

export interface Result {
  success: boolean;
  supplies: Record<Supply, number>;
  needs: Record<Supply, number>;
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
  spawnedPart: 0 | 1;
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

function fx(s: GameState, kind: Fx["kind"], x: number, y: number, by?: string) {
  s.fx.push({ n: ++s.nextId, kind, x: Math.round(x), y: Math.round(y), by });
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

export function carryLimit(p: { role: Role | null }) {
  return p.role === "engineer" ? 4 : 3;
}

export function speedOf(p: { mounted: boolean; role: Role | null }) {
  if (!p.mounted) return WALK_SPEED;
  return p.role === "cartographer" ? CARTO_SPEED : RIDE_SPEED;
}

export function slotsUsed(hold: Item[]): number {
  return hold.reduce((t, c) => t + KIND_INFO[c.kind].slots, 0);
}

export function needsFor(s: GameState): Record<Supply, number> {
  const base = s.settings.quick ? QUICK_NEEDS : NEEDS;
  const compass = s.hold.some((c) => c.kind === "compass");
  return { ...base, fuel: base.fuel - (compass ? 1 : 0) };
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
  const have = suppliesIn(s.hold);
  const need = needsFor(s);
  return SUPPLIES.every((k) => have[k] >= need[k]);
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

export function nearStables(p: { x: number; y: number }) {
  return dist(p.x, p.y, STABLE_POS.x, STABLE_POS.y) < 80;
}

export function nearStall(p: { x: number; y: number }) {
  return dist(p.x, p.y, MARKET_STALL.x, MARKET_STALL.y) < 70;
}

export function nearLamp(p: { x: number; y: number }) {
  return dist(p.x, p.y, LAMP.x, LAMP.y) < 60;
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
    ready: false, brig: false, busyUntil: 0, lastMoveAt: 0, accused: false, lastDump: -DUMP_COOLDOWN, lastBarter: 0, loadedDiamonds: 0,
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
      lastMoveAt: now, accused: false, lastDump: -DUMP_COOLDOWN, lastBarter: 0, loadedDiamonds: 0,
    } satisfies Partial<Player>);
  });

  // Treasures that wait all game: the compass in the palace and a hoard in the sealed cave.
  for (let i = 0; i < 2; i++) s.crates.push({ id: nid(s, "c"), kind: "diamond", x: CAVE.x - 20 + i * 40, y: CAVE.y - 10 + i * 12, zone: "cave" });
  s.piles.push({ id: nid(s, "g"), x: CAVE.x, y: CAVE.y + 22, n: 6 });
  spawnTide(s, rng, now, 0);
  log(s, "The tide is turning. Load the ferry and get aboard before the last tide.", "flood");
  if (wreckers.size) log(s, wreckers.size > 1 ? "Two Wreckers are hiding among you." : "A Wrecker is hiding among you.", "alert");
  return null;
}

/** What turns up in each place, by tide: about five supplies a tide, so the hold
 *  can't be filled early and low places are worth raiding before they drown. */
const SPAWNS: Partial<Record<ZoneId, Kind[]>>[] = [
  { harbour: ["fuel", "tools"], shipwreck: ["diamond", "fuel"], gardens: ["medicine"], palace: ["compass"], lighthouse: ["fuel"] },
  { coves: ["fuel", "medicine"], market: ["tools"], stables: ["tools"], gardens: ["medicine"], hotel: ["diamond"] },
  { market: ["fuel", "medicine"], hotel: ["tools"], palace: ["diamond"], lighthouse: ["fuel"], gardens: ["medicine"] },
  { gardens: ["medicine"], hotel: ["fuel", "diamond"], stables: ["medicine"], palace: ["tools"] },
  { palace: ["fuel", "medicine"], hotel: ["tools"], lighthouse: ["fuel"], stables: ["fuel"] },
];

/** Half of each tide's crates turn up as it starts; the rest wash up halfway through. */
function spawnList(t: number, part: 0 | 1): [ZoneId, Kind][] {
  const all: [ZoneId, Kind][] = [];
  for (const [z, kinds] of Object.entries(SPAWNS[t - 1] ?? {}) as [ZoneId, Kind[]][]) for (const k of kinds) all.push([z, k]);
  return all.filter((_, i) => i % 2 === part);
}

function spawnTide(s: GameState, rng: Rng, now: number, part: 0 | 1) {
  const g = { ...ground(s, now), level: seaLevel(s.tide, s.tideStartedAt - 1e9, s.totalTides, now) };
  s.spawnedPart = part;
  for (const [z, kind] of spawnList(s.tide, part)) {
    // If its place has already drowned, the crate washes up on high ground instead.
    const spot = randomSpot(z, g, rng) ?? randomSpot("stables", g, rng) ?? randomSpot("palace", g, rng);
    if (spot) s.crates.push({ id: nid(s, "c"), kind, x: spot.x, y: spot.y, zone: z });
  }
  if (part === 1) {
    log(s, "Fresh crates have washed up around the island.", "info");
    return;
  }
  // Pearls wash up on the beaches.
  const beaches: ZoneId[] = s.tide <= 2 ? ["coves", "shipwreck", "coves"] : ["market", "gardens"];
  for (const z of beaches) {
    const spot = randomSpot(z, g, rng);
    if (spot) s.piles.push({ id: nid(s, "g"), x: spot.x, y: spot.y, n: 1 + Math.floor(rng() * 2) });
  }
  s.marketStock = 2;
  s.version++;
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
    }
    if (s.spawnedPart === 0 && now >= s.tideStartedAt + s.tideMs / 2) spawnTide(s, rng, now, 1);
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
    for (const p of s.players) {
      if (p.brig) continue;
      if (footing(p.x, p.y, g) <= 0) {
        const to = nearestFooting(p.x, p.y, g);
        p.x = to.x;
        p.y = to.y;
        fx(s, "swept", p.x, p.y, p.id);
      }
      collect(s, p, now);
      if (nearGangway(p) && p.carry.length) loadAll(s, p);
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

function collect(s: GameState, p: Player, now: number) {
  if (now < p.busyUntil) return;
  for (const pile of s.piles) {
    if (dist(p.x, p.y, pile.x, pile.y) < PICKUP_R) {
      p.pearls += pile.n;
      pile.n = 0;
      fx(s, "pickup", pile.x, pile.y, p.id);
    }
  }
  s.piles = s.piles.filter((x) => x.n > 0);
  if (p.carry.length >= carryLimit(p)) return;
  const i = s.crates.findIndex((c) => dist(p.x, p.y, c.x, c.y) < PICKUP_R);
  if (i < 0) return;
  const c = s.crates[i];
  s.crates.splice(i, 1);
  p.carry.push({ id: c.id, kind: c.kind });
  if (p.role === "duchess" && c.zone !== "dropped") p.pearls++;
  fx(s, "pickup", c.x, c.y, p.id);
  if (c.kind === "compass") log(s, `${p.name} found the Antique Compass.`, "info");
  if (c.kind === "diamond" && c.zone !== "dropped") log(s, `${p.name} found a diamond at ${c.zone === "cave" ? "the Sapphire Caves" : ZONES[c.zone as ZoneId].name}.`, "info");
}

function loadAll(s: GameState, p: Player) {
  const loaded: string[] = [];
  for (const item of [...p.carry]) {
    if (slotsUsed(s.hold) + KIND_INFO[item.kind].slots > capacityOf(s)) continue;
    if (p.bot && !worthLoading(s, item.kind)) continue;
    p.carry = p.carry.filter((c) => c.id !== item.id);
    s.hold.push({ ...item, owner: p.id });
    if (item.kind === "diamond") p.loadedDiamonds++;
    loaded.push(KIND_INFO[item.kind].name.toLowerCase());
  }
  if (loaded.length) {
    fx(s, "load", GANGWAY.x, GANGWAY.y, p.id);
    log(s, `${p.name} loaded ${loaded.join(", ")}.`, "load");
  }
}

/** Bots keep space for what the crossing still needs. */
function worthLoading(s: GameState, kind: Kind) {
  const need = needsFor(s);
  const have = suppliesIn(s.hold);
  if (SUPPLIES.includes(kind as Supply) && have[kind as Supply] < need[kind as Supply]) return true;
  const stillNeeded = SUPPLIES.reduce((t, k) => t + Math.max(0, need[k] - have[k]), 0);
  return capacityOf(s) - slotsUsed(s.hold) - KIND_INFO[kind].slots >= stillNeeded;
}

function sail(s: GameState, now: number, early: boolean) {
  s.phase = "sailing";
  s.phaseEndsAt = now + SAIL_MS;
  s.sailAt = null;
  for (const o of s.offers) if (o.status === "open") o.status = "cancelled";
  const supplies = suppliesIn(s.hold);
  const needs = needsFor(s);
  const success = SUPPLIES.every((k) => supplies[k] >= needs[k]);
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
    supplies,
    needs,
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
  if (dist(a.x, a.y, b.x, b.y) > TRADE_R) return `Walk up to ${b.name} to trade.`;
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
  if (dist(a.x, a.y, b.x, b.y) > TRADE_R * 1.5) {
    o.status = "failed";
    s.version++;
    return `${a.name} walked off. Get close to trade.`;
  }
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
  accused: boolean;
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
  needs: Record<Supply, number>;
  supplies: Record<Supply, number>;
  offers: Offer[];
  vote: Vote | null;
  lampUntil: number;
  lampTide: number;
  secretFound: boolean;
  caveOpen: boolean;
  marketStock: number;
  diveReady: number[];
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
        carry: p.carry, pearls: p.pearls, ready: p.ready, brig: p.brig, busyUntil: p.busyUntil, accused: p.accused,
        ...(showWrecker ? { wrecker: p.wrecker } : {}),
        ...(p.id === pid && p.wrecker ? { lastDump: p.lastDump } : {}),
      };
    }),
    crates: s.crates,
    piles: s.piles,
    hold: s.hold,
    slots: slotsUsed(s.hold),
    capacity: capacityOf(s),
    needs: needsFor(s),
    supplies: suppliesIn(s.hold),
    offers: s.offers.filter((o) => o.from === pid || o.to === pid),
    vote: s.vote,
    lampUntil: s.lampUntil,
    lampTide: s.lampTide,
    secretFound: s.secretFound,
    caveOpen: s.caveOpen,
    marketStock: s.marketStock,
    diveReady: s.diveReady,
    log: s.log.slice(-12),
    fx: s.fx,
    result: s.result,
    wreckerCount: wreckerCount(s),
  };
}

/** Where the pier is, for messages and bots. */
export const PIER = { x: (DOCK.x1 + DOCK.x2) / 2, y: DOCK.y2 - 20 };
