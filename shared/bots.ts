// Practice bots: they walk the island like everyone else, fetch what the ferry needs,
// and vote. The server runs botTick() for each bot every frame.

import {
  type GameState, type Kind, type Player, type Rng, type Supply, PIER, SUPPLIES,
  carryLimit, castVote, dive, dump, ground, goalOf, lightLamp, nearDive, nearGangway, nearLamp,
  needsMet, savedForPeople, setReady, slotsUsed, speedOf, strike, capacityOf, STRIKE_R, MONSTER_R, MONSTER_WARN_MS,
} from "./game";
import { DIVE_SPOTS, GANGWAY, LAMP, ZONES, ZONE_IDS, findPath, footing, nearestFooting, onDock } from "./world";

export const BOT_NAMES = ["Odette", "Augustin", "Ines", "Florian", "Margaux", "Teodor", "Beatrix", "Lucien"];

type Goal =
  | { kind: "crate"; id: string; x: number; y: number }
  | { kind: "gangway"; x: number; y: number }
  | { kind: "dock"; x: number; y: number }
  | { kind: "dive"; x: number; y: number; spot: number }
  | { kind: "lamp"; x: number; y: number }
  | { kind: "wander"; x: number; y: number };

export interface Brain {
  goal: Goal | null;
  path: { x: number; y: number }[];
  thinkAt: number;
  progressAt: number;
  lastX: number;
  lastY: number;
  answered: Set<string>;
  votedOn: string;
  voteAt: number;
  offerAt: number;
  /** A short breather after picking something up. */
  pauseUntil: number;
  lastCarry: number;
  /** The monster this bot already decided whether to dodge. */
  dodged: number;
}

export function newBrain(): Brain {
  return { goal: null, path: [], thinkAt: 0, progressAt: 0, lastX: 0, lastY: 0, answered: new Set(), votedOn: "", voteAt: 0, offerAt: 0, pauseUntil: 0, lastCarry: 0, dodged: 0 };
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** What the ferry still lacks, counting what everyone is already carrying towards it. */
function shortfall(s: GameState): Record<Supply, number> {
  // Any crate counts toward the goal, so every supply is wanted until the count is reached.
  const carried = s.players.filter((p) => !p.wrecker).reduce((t, p) => t + p.carry.filter((c) => c.kind !== "cutlass").length, 0);
  const left = Math.max(0, goalOf(s) - s.hold.length - carried);
  return { fuel: left, medicine: left, tools: left };
}

/** What a bot carries that's meant for the ferry (not its cutlass). */
const cargo = (p: Player) => p.carry.filter((c) => c.kind !== "cutlass");

function worth(s: GameState, kind: Kind, short: Record<Supply, number>): number {
  if (kind === "cutlass") return 1.5;
  if (kind === "compass") return s.hold.some((c) => c.kind === "compass") ? 1 : 7;
  if (kind === "diamond") return capacityOf(s) - slotsUsed(s.hold) >= 4 ? 5 : 2;
  return short[kind] > 0 ? 10 : capacityOf(s) - slotsUsed(s.hold) > 5 ? 0.8 : 0;
}

/** Called every server tick (dt in seconds). Returns true if the bot changed shared state. */
export function botTick(s: GameState, p: Player, b: Brain, now: number, dt: number, rng: Rng, claimed: Set<string>): boolean {
  if (s.phase !== "play" || p.brig) return false;
  let changed = vote(s, p, b, now, rng);
  if (now < p.busyUntil) return changed;
  if (p.carry.length > b.lastCarry) b.pauseUntil = now + 1200 + rng() * 1800;
  b.lastCarry = p.carry.length;
  if (now < b.pauseUntil) {
    p.moving = false;
    return changed;
  }
  changed = swing(s, p, now, rng) || changed;

  // Bubbles nearby while carrying crates? Most of the time, back away from the shore.
  const m = s.monster;
  if (m && !m.grabbed && b.dodged !== m.grabAt && cargo(p).length && dist(p, m) < MONSTER_R + 70) {
    b.dodged = m.grabAt;
    if (rng() < 0.7) {
      const d = dist(p, m) || 1;
      const gr = ground(s, now);
      const to = nearestFooting(p.x + ((p.x - m.x) / d) * 180, p.y + ((p.y - m.y) / d) * 180, gr);
      const path = findPath(p.x, p.y, to.x, to.y, gr);
      if (path?.length) {
        b.goal = { kind: "wander", x: to.x, y: to.y };
        b.path = path;
        b.progressAt = now;
        b.thinkAt = now + MONSTER_WARN_MS + 1500;
      }
    }
  }

  // Arrived somewhere? Do the thing that brought us here.
  const g = b.goal;
  if (g && dist(p, g) < 26) {
    if (g.kind === "dive" && nearDive(p) >= 0) changed = !dive(s, p.id, now) || changed;
    if (g.kind === "lamp" && nearLamp(p)) changed = !lightLamp(s, p.id, now) || changed;
    if (g.kind === "gangway" && p.wrecker && nearGangway(p) && rng() < 0.5) changed = !dump(s, p.id, now, rng) || changed;
    if (g.kind === "dock" || (g.kind === "gangway" && onDock(p.x, p.y))) changed = maybeReady(s, p, now) || changed;
    b.goal = null;
    b.path = [];
    b.thinkAt = now + 400 + rng() * 900;
  }

  if (!b.goal || now >= b.thinkAt) {
    think(s, p, b, now, rng, claimed);
    b.thinkAt = now + 1500 + rng() * 1500;
  }
  if (b.goal?.kind === "crate") claimed.add(b.goal.id);
  walk(s, p, b, now, dt);
  return changed;
}

function maybeReady(s: GameState, p: Player, now: number): boolean {
  if (p.ready || !onDock(p.x, p.y)) return false;
  const humansReady = s.players.some((q) => !q.bot && q.ready);
  const late = s.tide >= s.totalTides && s.endsAt - now < 60_000;
  if (humansReady || late || (!p.wrecker && needsMet(s) && s.players.every((q) => q.bot || !q.connected))) {
    setReady(s, p.id, true);
    return true;
  }
  return false;
}

function think(s: GameState, p: Player, b: Brain, now: number, rng: Rng, claimed: Set<string>) {
  const left = s.endsAt - now;
  const g = ground(s, now);
  const humansReady = s.players.some((q) => !q.bot && q.ready);
  const set = (goal: Goal) => {
    if (b.goal && b.goal.kind === goal.kind && dist(b.goal, goal) < 30 && b.path.length) return;
    b.goal = goal;
    b.path = findPath(p.x, p.y, goal.x, goal.y, g) ?? [];
    if (!b.path.length && dist(p, goal) > 30) b.goal = null;
    b.progressAt = now;
  };
  const toDock = () => {
    set({ kind: "dock", x: PIER.x + (rng() - 0.5) * 120, y: PIER.y - 8 + rng() * 20 });
    // Stranded by the tide? The lighthouse lamp reveals the stepping stones home.
    if (!b.goal && !s.secretFound && footing(LAMP.x, LAMP.y + 25, g) > 0) set({ kind: "lamp", x: LAMP.x, y: LAMP.y + 25 });
  };

  // Time to go: last call, or the table wants to leave.
  if (left < 70_000 || s.sailAt !== null || humansReady) {
    if (cargo(p).length && !nearGangway(p) && !p.wrecker) return set({ kind: "gangway", ...GANGWAY });
    if (!onDock(p.x, p.y)) return toDock();
    maybeReady(s, p, now);
    return;
  }

  const limit = carryLimit(p);
  const short = shortfall(s);
  const missing = SUPPLIES.some((k) => short[k] > 0);
  if (p.carry.length >= limit && cargo(p).length) return set({ kind: "gangway", ...GANGWAY });

  // Best crate by value over distance, skipping ones other bots are fetching.
  let best: { id: string; x: number; y: number } | null = null;
  let bestScore = 0;
  for (const c of s.crates) {
    if (claimed.has(c.id) && b.goal?.kind === "crate" && b.goal.id !== c.id) continue;
    if (claimed.has(c.id) && b.goal?.kind !== "crate") continue;
    if (c.zone === "cave" && !s.caveOpen) continue;
    if (c.zone === "indoors") continue; // bots stay outdoors: what's inside buildings is for people
    if (c.owner && c.owner !== p.id) continue;
    if (footing(c.x, c.y, g) <= 0) continue;
    if (savedForPeople(s, p, c, now)) continue;
    let v = worth(s, c.kind, short);
    if (p.wrecker && SUPPLIES.includes(c.kind as Supply)) v += 3; // hoard supplies so nobody else loads them
    if (v <= 0) continue;
    const score = v / (dist(p, c) + 250);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  const carryingUseful = cargo(p).some((c) => c.kind !== "diamond" || slotsUsed(s.hold) <= capacityOf(s) - 2);
  if (cargo(p).length && (!best || bestScore < 0.006 || (cargo(p).length >= 2 && dist(p, GANGWAY) < 500)) && carryingUseful && !p.wrecker) {
    return set({ kind: "gangway", ...GANGWAY });
  }
  if (p.wrecker && cargo(p).length >= 2 && now - p.lastDump > 45_000 && s.hold.length) return set({ kind: "gangway", ...GANGWAY });
  if (best && bestScore > 0.004) return set({ kind: "crate", id: best.id, x: best.x, y: best.y });

  // Nothing worth fetching nearby: dive, light the lamp or roam.
  if (s.tide >= 3 && s.lampTide !== s.tide && rng() < 0.15 && footing(LAMP.x, LAMP.y + 25, g) > 0) return set({ kind: "lamp", x: LAMP.x, y: LAMP.y + 25 });
  const spot = Math.floor(rng() * DIVE_SPOTS.length);
  if (rng() < 0.4 && now >= s.diveReady[spot]) {
    const d = DIVE_SPOTS[spot];
    const stand = { x: d.x + 55, y: d.y };
    if (footing(stand.x, stand.y, g) > 0) return set({ kind: "dive", ...stand, spot });
  }
  if (!missing && !cargo(p).length && s.tide >= 3) return toDock();
  if (cargo(p).length && carryingUseful && !p.wrecker) return set({ kind: "gangway", ...GANGWAY });
  const dry = ZONE_IDS.filter((z) => footing(ZONES[z].x, ZONES[z].y, g) > 0 && z !== "caves");
  const z = ZONES[dry[Math.floor(rng() * dry.length)] ?? "palace"];
  set({ kind: "wander", x: z.x + (rng() - 0.5) * z.r, y: z.y + (rng() - 0.5) * z.r });
}

/** A bot with a cutlass now and then knocks out someone close by who's carrying plenty. */
function swing(s: GameState, p: Player, now: number, rng: Rng): boolean {
  if (!p.carry.some((c) => c.kind === "cutlass") || rng() > 0.04) return false;
  const victim = s.players.find((q) =>
    q.id !== p.id && !q.brig && now >= q.downUntil && now >= q.guardUntil && dist(p, q) < STRIKE_R &&
    !(p.wrecker && q.wrecker) && cargo(q).length >= (p.wrecker ? 1 : 2));
  return !!victim && !strike(s, p.id, victim.id, now);
}

function walk(s: GameState, p: Player, b: Brain, now: number, dt: number) {
  const target = b.path[0];
  if (!target) {
    if (p.moving) p.moving = false;
    return;
  }
  const g = ground(s, now);
  const d = dist(p, target);
  // Bots move slower than people so humans get a fair shot at the crates.
  const step = speedOf(p) * 0.7 * Math.max(0.3, footing(p.x, p.y, g)) * dt;
  p.dir = Math.atan2(target.y - p.y, target.x - p.x);
  if (d <= step) {
    p.x = target.x;
    p.y = target.y;
    b.path.shift();
  } else {
    const nx = p.x + ((target.x - p.x) / d) * step;
    const ny = p.y + ((target.y - p.y) / d) * step;
    if (footing(nx, ny, g) > 0) {
      p.x = nx;
      p.y = ny;
    } else if (footing(nx, p.y, g) > 0) {
      p.x = nx; // slide along the edge
    } else if (footing(p.x, ny, g) > 0) {
      p.y = ny;
    } else {
      b.path = [];
      b.goal = null;
    }
  }
  p.moving = true;
  // Stuck (the tide moved under us)? Rethink.
  if (dist(p, { x: b.lastX, y: b.lastY }) > 20) {
    b.lastX = p.x;
    b.lastY = p.y;
    b.progressAt = now;
  } else if (now - b.progressAt > 2500) {
    b.goal = null;
    b.path = [];
    b.progressAt = now;
  }
}

function vote(s: GameState, p: Player, b: Brain, now: number, rng: Rng): boolean {
  const v = s.vote;
  if (!v || v.outcome !== "open" || v.target === p.id || b.votedOn === v.id) return false;
  if (!b.voteAt) b.voteAt = now + 2500 + rng() * 4000;
  if (now < b.voteAt) return false;
  b.votedOn = v.id;
  b.voteAt = 0;
  const target = s.players.find((q) => q.id === v.target)!;
  // Wreckers protect each other; everyone else is a little suspicious of whoever lingers at the gangway.
  const yes = p.wrecker ? !target.wrecker : rng() < (dist(target, GANGWAY) < 200 ? 0.7 : 0.45);
  castVote(s, p.id, yes, now);
  return true;
}

