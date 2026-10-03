// The Last Ferry: rules engine. Pure game logic shared by the server (authoritative)
// and the client (types and helpers). The server owns the only real GameState and
// sends each player a redacted view from viewFor().

export type Place = "coves" | "gardens" | "market" | "hotel" | "palace" | "harbour";
export type Supply = "fuel" | "medicine" | "tools";
export type CardKind = Supply | "diamond" | "compass" | "spoiled";
export type Wantable = Supply | "diamond" | "compass";
export type Role = "diver" | "engineer" | "physician" | "cartographer" | "jeweler" | "duchess";
export type Phase = "lobby" | "flood" | "search" | "reveal" | "trade" | "load" | "flip" | "voyage" | "over";

export const PLACES: Place[] = ["coves", "gardens", "market", "hotel", "palace", "harbour"];
export const SUPPLIES: Supply[] = ["fuel", "medicine", "tools"];
export const ROLES: Role[] = ["diver", "engineer", "physician", "cartographer", "jeweler", "duchess"];
export const WANTABLE: Wantable[] = ["fuel", "medicine", "tools", "diamond", "compass"];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const MAX_LOADS_PER_TIDE = 2;
export const MAX_OPEN_OFFERS = 3;

export const PLACE_INFO: Record<Place, { name: string; yields: string; blurb: string }> = {
  coves: { name: "Turquoise Coves", yields: "Fuel · pearls", blurb: "Clear water and white sand. The first to go under." },
  gardens: { name: "Hanging Gardens", yields: "Medicine", blurb: "Terraces of lemon trees above the bay." },
  market: { name: "Pearl Market", yields: "Pearls · diamonds", blurb: "Striped awnings and brass scales." },
  hotel: { name: "Grand Hotel", yields: "Tools · diamonds", blurb: "Chandeliers, a ballroom and a forgotten safe." },
  palace: { name: "Hilltop Palace", yields: "1 diamond or the compass, +2 pearls", blurb: "Never floods, but the climb is long." },
  harbour: { name: "Harbour", yields: "Fuel · tools", blurb: "Where the ferry waits. Floods last." },
};

export const ROLE_INFO: Record<Role, { name: string; power: string; short: string; wear: string }> = {
  diver: { name: "The Pearl Diver", short: "Deep dive", power: "+1 pearl on every search, and full draws at flooded places.", wear: "Silk scarf, salt-bleached linen" },
  engineer: { name: "The Engineer", short: "Shipyard hands", power: "+1 fuel whenever you search the Harbour.", wear: "Brass goggles, oil-stained gloves" },
  physician: { name: "The Physician", short: "Remedy", power: "+1 medicine whenever you search the Gardens.", wear: "Tweed frock coat, leather bag" },
  cartographer: { name: "The Cartographer", short: "Foresight", power: "You see which place floods next.", wear: "Velvet riding coat, map case" },
  jeweler: { name: "The Jeweler", short: "Appraise", power: "You see whether a card offered to you is spoiled.", wear: "Silk cravat, loupe, garnet brooch" },
  duchess: { name: "The Duchess", short: "Influence", power: "Each pearl you offer in a trade counts as two.", wear: "Emerald velvet, pearl tiara" },
};

export const CARD_INFO: Record<CardKind, { name: string; slots: number; worth: number }> = {
  fuel: { name: "Fuel", slots: 1, worth: 0 },
  medicine: { name: "Medicine", slots: 1, worth: 0 },
  tools: { name: "Tools", slots: 1, worth: 0 },
  diamond: { name: "Diamond", slots: 2, worth: 3 },
  compass: { name: "Antique Compass", slots: 1, worth: 0 },
  spoiled: { name: "Spoiled crate", slots: 1, worth: 0 },
};

/** Bigger crowds need more supplies for the crossing. */
export function baseNeeds(players: number, quick: boolean): Record<Supply, number> {
  const q = quick ? 1 : 0;
  if (players <= 3) return { fuel: 4 - q, medicine: 3 - q, tools: 2 };
  if (players <= 5) return { fuel: 6 - q, medicine: 4 - q, tools: 3 };
  return { fuel: 7 - q, medicine: 6 - q, tools: 3 };
}

export interface Settings {
  quick: boolean;
  wrecker: "auto" | "on" | "off";
}

export interface Card {
  id: string;
  kind: CardKind;
  /** Spoiled crates are disguised as a supply. */
  looksLike?: Supply;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  role: Role | null;
  wrecker: boolean;
  hand: Card[];
  pearls: number;
  bot: boolean;
  connected: boolean;
  ready: boolean;
  done: boolean;
  pick: Place | null;
  loadedThisTide: number;
}

export interface Crate {
  id: string;
  card: Card;
  owner: string;
  tide: number;
  revealed: boolean;
}

export interface Offer {
  id: string;
  from: string;
  to: string;
  give: { cardIds: string[]; pearls: number };
  want: { kinds: Partial<Record<Wantable, number>>; pearls: number };
  /** Snapshot of the offered cards, kept so closed offers still show what was on the table. */
  giveCards: Card[];
  status: "open" | "accepted" | "declined" | "cancelled" | "failed";
}

export interface Draw {
  place: Place;
  cards: CardKind[];
  pearls: number;
}

export interface LogEntry {
  n: number;
  text: string;
  kind: "info" | "flood" | "trade" | "load" | "alert";
}

export interface Result {
  success: boolean;
  supplies: Record<Supply, number>;
  needs: Record<Supply, number>;
  winners: "islanders" | "wrecker" | "nobody";
  fortunes: { id: string; fortune: number; diamonds: number; pearls: number }[];
  grandFortune: string[];
  wreckers: string[];
  sailedEarly: boolean;
}

export interface GameState {
  code: string;
  hostId: string;
  phase: Phase;
  tide: number;
  totalTides: number;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  floodOrder: Place[];
  flooded: Place[];
  players: Player[];
  hold: Crate[];
  capacity: number;
  offers: Offer[];
  draws: Record<string, Draw>;
  log: LogEntry[];
  compassFound: boolean;
  settings: Settings;
  result: Result | null;
  nextId: number;
  round: number;
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

function weighted<T extends string>(table: [T, number][], rng: Rng): T {
  const total = table.reduce((t, [, w]) => t + w, 0);
  let r = rng() * total;
  for (const [k, w] of table) {
    if ((r -= w) < 0) return k;
  }
  return table[table.length - 1][0];
}

function log(s: GameState, text: string, kind: LogEntry["kind"] = "info") {
  s.log.push({ n: ++s.nextId, text, kind });
  if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
}

export function player(s: GameState, id: string): Player | undefined {
  return s.players.find((p) => p.id === id);
}

/** What a card appears to be to someone who can't see through a disguise. */
export function apparentKind(c: Card): CardKind {
  return c.kind === "spoiled" && c.looksLike ? c.looksLike : c.kind;
}

export function slotsUsed(hold: Crate[]): number {
  return hold.reduce((t, c) => t + CARD_INFO[c.card.kind].slots, 0);
}

export function needsFor(s: GameState, onlyRevealed: boolean): Record<Supply, number> {
  const compass = s.hold.some((c) => c.card.kind === "compass" && (!onlyRevealed || c.revealed));
  const base = baseNeeds(s.players.length, s.settings.quick);
  return { ...base, fuel: base.fuel - (compass ? 1 : 0) };
}

export function suppliesIn(hold: Crate[], onlyRevealed: boolean): Record<Supply, number> {
  const out: Record<Supply, number> = { fuel: 0, medicine: 0, tools: 0 };
  for (const c of hold) {
    if (onlyRevealed && !c.revealed) continue;
    if (c.card.kind === "fuel" || c.card.kind === "medicine" || c.card.kind === "tools") out[c.card.kind]++;
  }
  return out;
}

export function capacityFor(n: number): number {
  return n <= 3 ? 12 : n <= 5 ? 16 : 20;
}

export function wreckerCount(s: GameState): number {
  const n = s.players.length;
  if (s.settings.wrecker === "off") return 0;
  if (s.settings.wrecker === "auto" && n < 5) return 0;
  if (n < 3) return 0;
  return n >= 7 ? 2 : 1;
}

export const PHASE_SECONDS: Record<Phase, number> = {
  lobby: 0,
  flood: 4,
  search: 40,
  reveal: 5,
  trade: 120,
  load: 40,
  flip: 7,
  voyage: 9,
  over: 0,
};

/** First tide runs slower so new players can read the hints. */
export function phaseSeconds(s: GameState, phase: Phase): number {
  const base = PHASE_SECONDS[phase];
  if (s.tide === 1 && (phase === "search" || phase === "trade" || phase === "load")) return Math.round(base * 1.5);
  return base;
}

// ---------- setup ----------

export function createGame(code: string, hostId: string): GameState {
  return {
    code,
    hostId,
    phase: "lobby",
    tide: 0,
    totalTides: 5,
    phaseStartedAt: 0,
    phaseEndsAt: null,
    floodOrder: [],
    flooded: [],
    players: [],
    hold: [],
    capacity: 12,
    offers: [],
    draws: {},
    log: [],
    compassFound: false,
    settings: { quick: false, wrecker: "auto" },
    result: null,
    nextId: 0,
    round: 0,
  };
}

export function addPlayer(s: GameState, id: string, name: string, bot = false): string | null {
  if (s.phase !== "lobby") return "This game has already started.";
  if (s.players.length >= MAX_PLAYERS) return "This room is full (8 players).";
  const used = new Set(s.players.map((p) => p.seat));
  let seat = 0;
  while (used.has(seat)) seat++;
  s.players.push({
    id, name, seat, role: null, wrecker: false, hand: [], pearls: 0, bot,
    connected: true, ready: false, done: false, pick: null, loadedThisTide: 0,
  });
  if (!s.hostId || !player(s, s.hostId)) s.hostId = id;
  return null;
}

export function removePlayer(s: GameState, id: string) {
  if (s.phase !== "lobby") return;
  s.players = s.players.filter((p) => p.id !== id);
  if (s.hostId === id) s.hostId = s.players.find((p) => !p.bot)?.id ?? "";
}

export function startGame(s: GameState, rng: Rng, now: number): string | null {
  if (s.phase !== "lobby" && s.phase !== "over") return "The game is already running.";
  if (s.players.length < MIN_PLAYERS) return "You need at least 2 players. Add a practice bot to try it alone.";
  s.round++;
  s.totalTides = s.settings.quick ? 3 : 5;
  s.tide = 0;
  s.hold = [];
  s.offers = [];
  s.draws = {};
  s.flooded = [];
  s.result = null;
  s.compassFound = false;
  s.capacity = capacityFor(s.players.length);
  s.log = [];

  // Coves always go first, the harbour floods after the last tide, the palace never floods.
  const middle = shuffle<Place>(["gardens", "market", "hotel"], rng);
  s.floodOrder = s.settings.quick ? ["coves", middle[0]] : ["coves", ...middle];

  const roles = shuffle(ROLES, rng);
  const wreckers = new Set(shuffle(s.players.map((p) => p.id), rng).slice(0, wreckerCount(s)));
  s.players.forEach((p, i) => {
    p.role = roles[i % roles.length];
    p.wrecker = wreckers.has(p.id);
    p.hand = [];
    p.pearls = 2;
    p.ready = false;
    p.done = false;
    p.pick = null;
    p.loadedThisTide = 0;
    // Everyone starts with one supply so the first trade round has something to talk about.
    p.hand.push({ id: nid(s, "c"), kind: SUPPLIES[Math.floor(rng() * 3)] });
    if (p.wrecker) {
      for (let k = 0; k < 2; k++) {
        p.hand.push({ id: nid(s, "c"), kind: "spoiled", looksLike: SUPPLIES[Math.floor(rng() * 3)] });
      }
    }
  });
  log(s, "The tide is turning. Fill the ferry and sail before Saltmere sinks.");
  beginTide(s, now);
  return null;
}

function setPhase(s: GameState, phase: Phase, now: number) {
  s.phase = phase;
  s.phaseStartedAt = now;
  const secs = phaseSeconds(s, phase);
  s.phaseEndsAt = secs ? now + secs * 1000 : null;
  for (const p of s.players) p.done = false;
}

function beginTide(s: GameState, now: number) {
  s.tide++;
  for (const p of s.players) {
    p.pick = null;
    p.loadedThisTide = 0;
  }
  s.draws = {};
  // Tide 1 is calm; from tide 2 one place floods each tide.
  const toFlood = s.tide >= 2 ? s.floodOrder[s.tide - 2] : undefined;
  if (toFlood && !s.flooded.includes(toFlood)) {
    s.flooded.push(toFlood);
    log(s, `The water rises: ${PLACE_INFO[toFlood].name} is flooded.`, "flood");
  } else {
    log(s, `Tide ${s.tide}. The sea is calm, for now.`, "flood");
  }
  setPhase(s, "flood", now);
}

/** The place that will flood at the start of the next tide, if any. */
export function nextFlood(s: GameState): Place | null {
  if (s.tide >= s.totalTides) return "harbour";
  return s.floodOrder[s.tide - 1] ?? null;
}

// ---------- phase flow ----------

/** Move to the next phase. Called when the timer runs out or everyone is done. */
export function advance(s: GameState, rng: Rng, now: number) {
  switch (s.phase) {
    case "flood":
      setPhase(s, "search", now);
      break;
    case "search":
      resolveSearch(s, rng);
      setPhase(s, "reveal", now);
      break;
    case "reveal":
      setPhase(s, "trade", now);
      break;
    case "trade":
      for (const o of s.offers) if (o.status === "open") o.status = "cancelled";
      setPhase(s, "load", now);
      break;
    case "load":
      for (const c of s.hold) if (c.tide === s.tide) c.revealed = true;
      setPhase(s, "flip", now);
      {
        const fresh = s.hold.filter((c) => c.tide === s.tide);
        const spoiled = fresh.filter((c) => c.card.kind === "spoiled").length;
        if (fresh.length) log(s, `${fresh.length} crate${fresh.length > 1 ? "s" : ""} opened in the hold.`, "load");
        if (spoiled) log(s, `${spoiled} of them ${spoiled > 1 ? "were" : "was"} spoiled. Someone is wrecking the voyage.`, "alert");
      }
      break;
    case "flip": {
      const active = s.players.length;
      const ready = s.players.filter((p) => p.ready).length;
      if (s.tide >= s.totalTides) {
        log(s, "The harbour floods. The ferry must sail now.", "flood");
        sail(s, now, false);
      } else if (ready * 2 > active) {
        log(s, "The table is ready. The ferry casts off.", "info");
        sail(s, now, true);
      } else {
        beginTide(s, now);
      }
      break;
    }
    case "voyage":
      setPhase(s, "over", now);
      break;
    default:
      break;
  }
}

/** True when every player has acted and the phase can end early. */
export function everyoneDone(s: GameState): boolean {
  if (s.phase === "search") return s.players.every((p) => p.pick);
  if (s.phase === "trade" || s.phase === "load") return s.players.every((p) => p.done);
  return false;
}

function drawTable(place: Place, compassFound: boolean): [CardKind | "pearls", number][] {
  switch (place) {
    case "coves": return [["fuel", 5], ["pearls", 4], ["diamond", 1]];
    case "gardens": return [["medicine", 7], ["pearls", 2], ["tools", 1]];
    case "market": return [["pearls", 6], ["diamond", 3], ["medicine", 1]];
    case "hotel": return [["tools", 5], ["diamond", 3], ["medicine", 2]];
    case "palace": return compassFound ? [["diamond", 1]] : [["diamond", 6], ["compass", 4]];
    case "harbour": return [["fuel", 6], ["tools", 4]];
  }
}

function resolveSearch(s: GameState, rng: Rng) {
  for (const p of s.players) {
    if (!p.pick) {
      // Nobody is left behind: an undecided player searches the nearest dry ground.
      p.pick = (["harbour", "hotel", "gardens", "market", "coves", "palace"] as Place[]).find((pl) => !s.flooded.includes(pl)) ?? "palace";
    }
    const place = p.pick;
    const flooded = s.flooded.includes(place);
    let count = place === "palace" ? 1 : flooded && p.role !== "diver" ? 1 : 2;
    const draw: Draw = { place, cards: [], pearls: 0 };
    for (let i = 0; i < count; i++) {
      const k = weighted(drawTable(place, s.compassFound), rng);
      if (k === "pearls") draw.pearls += 2;
      else {
        if (k === "compass") s.compassFound = true;
        draw.cards.push(k);
      }
    }
    if (place === "palace") draw.pearls += 2;
    if (p.role === "diver") draw.pearls += 1;
    if (p.role === "engineer" && place === "harbour") draw.cards.push("fuel");
    if (p.role === "physician" && place === "gardens") draw.cards.push("medicine");
    for (const k of draw.cards) p.hand.push({ id: nid(s, "c"), kind: k });
    p.pearls += draw.pearls;
    s.draws[p.id] = draw;
  }
  if (s.compassFound && !s.log.some((l) => l.text.includes("compass"))) log(s, "Someone found the antique compass in the palace.", "info");
}

function sail(s: GameState, now: number, early: boolean) {
  for (const c of s.hold) c.revealed = true;
  const needs = needsFor(s, false);
  const supplies = suppliesIn(s.hold, false);
  const success = SUPPLIES.every((k) => supplies[k] >= needs[k]);
  const wreckers = s.players.filter((p) => p.wrecker).map((p) => p.id);
  const fortunes = s.players.map((p) => {
    const diamonds = s.hold.filter((c) => c.owner === p.id && c.card.kind === "diamond").length;
    return { id: p.id, diamonds, pearls: p.pearls, fortune: success ? diamonds * 3 + p.pearls : 0 };
  });
  const islanders = fortunes.filter((f) => !player(s, f.id)?.wrecker);
  const best = Math.max(0, ...islanders.map((f) => f.fortune));
  s.result = {
    success,
    supplies,
    needs,
    winners: success ? "islanders" : wreckers.length ? "wrecker" : "nobody",
    fortunes: fortunes.sort((a, b) => b.fortune - a.fortune),
    grandFortune: success && best > 0 ? islanders.filter((f) => f.fortune === best).map((f) => f.id) : [],
    wreckers,
    sailedEarly: early,
  };
  setPhase(s, "voyage", now);
}

// ---------- player actions ----------

export function pickPlace(s: GameState, pid: string, place: Place): string | null {
  const p = player(s, pid);
  if (!p) return "You're not in this game.";
  if (s.phase !== "search") return "You can only choose a place during the search.";
  if (!PLACES.includes(place)) return "That place doesn't exist.";
  p.pick = place;
  return null;
}

export function setDone(s: GameState, pid: string, done = true): string | null {
  const p = player(s, pid);
  if (!p) return "You're not in this game.";
  if (s.phase !== "trade" && s.phase !== "load") return null;
  p.done = done;
  return null;
}

export function toggleReady(s: GameState, pid: string, ready?: boolean): string | null {
  const p = player(s, pid);
  if (!p) return "You're not in this game.";
  if (s.phase === "lobby" || s.phase === "voyage" || s.phase === "over") return null;
  p.ready = ready ?? !p.ready;
  return null;
}

export function loadCard(s: GameState, pid: string, cardId: string): string | null {
  const p = player(s, pid);
  if (!p) return "You're not in this game.";
  if (s.phase !== "load") return "Crates can only be loaded during the loading step.";
  if (p.loadedThisTide >= MAX_LOADS_PER_TIDE) return "You've loaded 2 crates this tide.";
  const idx = p.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return "That card isn't in your hand.";
  const card = p.hand[idx];
  if (slotsUsed(s.hold) + CARD_INFO[card.kind].slots > s.capacity) {
    return CARD_INFO[card.kind].slots > 1 ? "A diamond needs 2 free slots, and the hold doesn't have them." : "The hold is full.";
  }
  p.hand.splice(idx, 1);
  p.loadedThisTide++;
  s.hold.push({ id: nid(s, "h"), card, owner: p.id, tide: s.tide, revealed: false });
  if (p.loadedThisTide >= MAX_LOADS_PER_TIDE) p.done = true;
  return null;
}

function countWant(w: Offer["want"]): number {
  return Object.values(w.kinds).reduce((t, n) => t + (n ?? 0), 0);
}

export function makeOffer(s: GameState, from: string, to: string, give: Offer["give"], want: Offer["want"]): string | null {
  const a = player(s, from);
  const b = player(s, to);
  if (!a || !b) return "That player isn't here.";
  if (from === to) return "You can't trade with yourself.";
  if (s.phase !== "trade") return "Trading is only open during the market.";
  if (s.offers.filter((o) => o.from === from && o.status === "open").length >= MAX_OPEN_OFFERS) return "You already have 3 offers waiting. Cancel one first.";
  const pearls = Math.max(0, Math.floor(give.pearls || 0));
  const wantPearls = Math.max(0, Math.floor(want.pearls || 0));
  const ids = Array.from(new Set(give.cardIds || []));
  if (!ids.every((id) => a.hand.some((c) => c.id === id))) return "You no longer have one of those cards.";
  if (pearls > a.pearls) return "You don't have that many pearls.";
  const kinds: Offer["want"]["kinds"] = {};
  for (const k of WANTABLE) {
    const n = Math.max(0, Math.floor(want.kinds?.[k] ?? 0));
    if (n) kinds[k] = Math.min(n, 5);
  }
  if (!ids.length && !pearls && !countWant({ kinds, pearls: wantPearls }) && !wantPearls) return "Add something to give or ask for.";
  const giveCards = ids.map((id) => ({ ...a.hand.find((c) => c.id === id)! }));
  s.offers.push({ id: nid(s, "o"), from, to, give: { cardIds: ids, pearls }, want: { kinds, pearls: wantPearls }, giveCards, status: "open" });
  return null;
}

export function cancelOffer(s: GameState, pid: string, offerId: string): string | null {
  const o = s.offers.find((x) => x.id === offerId);
  if (!o || o.from !== pid || o.status !== "open") return null;
  o.status = "cancelled";
  return null;
}

export function respondOffer(s: GameState, pid: string, offerId: string, accept: boolean): string | null {
  const o = s.offers.find((x) => x.id === offerId);
  if (!o || o.to !== pid) return "That offer is gone.";
  if (o.status !== "open") return "That offer has already closed.";
  if (s.phase !== "trade") return "Trading has closed.";
  if (!accept) {
    o.status = "declined";
    return null;
  }
  const a = player(s, o.from)!;
  const b = player(s, o.to)!;
  // Check the offerer still has everything.
  const giveCards = o.give.cardIds.map((id) => a.hand.find((c) => c.id === id));
  if (giveCards.some((c) => !c) || a.pearls < o.give.pearls) {
    o.status = "failed";
    return `${a.name} no longer has what they offered.`;
  }
  // Pick what the receiver hands back. A Wrecker always slips spoiled crates in first.
  const taken: Card[] = [];
  for (const k of WANTABLE) {
    const n = o.want.kinds[k] ?? 0;
    if (!n) continue;
    const pool = b.hand.filter((c) => !taken.includes(c) && apparentKind(c) === k);
    pool.sort((x, y) => {
      const xs = x.kind === "spoiled" ? 1 : 0;
      const ys = y.kind === "spoiled" ? 1 : 0;
      return b.wrecker ? ys - xs : 0;
    });
    if (pool.length < n) return `You don't have ${n} ${CARD_INFO[k].name.toLowerCase()} to give.`;
    taken.push(...pool.slice(0, n));
  }
  if (b.pearls < o.want.pearls) return `You don't have ${o.want.pearls} pearls.`;

  const gc = giveCards as Card[];
  a.hand = a.hand.filter((c) => !gc.includes(c));
  b.hand = b.hand.filter((c) => !taken.includes(c));
  a.hand.push(...taken);
  b.hand.push(...gc);
  a.pearls -= o.give.pearls;
  b.pearls += o.give.pearls * (a.role === "duchess" ? 2 : 1);
  b.pearls -= o.want.pearls;
  a.pearls += o.want.pearls * (b.role === "duchess" ? 2 : 1);
  o.status = "accepted";
  // Any other offer that relied on these cards can no longer happen.
  for (const other of s.offers) {
    if (other.status !== "open") continue;
    const owner = player(s, other.from);
    if (owner && !other.give.cardIds.every((id) => owner.hand.some((c) => c.id === id))) other.status = "failed";
  }
  log(s, `${a.name} and ${b.name} made a trade.`, "trade");
  return null;
}

// ---------- views ----------

export interface CardView {
  id: string;
  kind: CardKind;
  /** Set when the viewer knows this is a spoiled crate in disguise. */
  disguisedAs?: Supply;
}

export interface PlayerView {
  id: string;
  name: string;
  seat: number;
  role: Role | null;
  bot: boolean;
  connected: boolean;
  ready: boolean;
  done: boolean;
  picked: boolean;
  pick: Place | null;
  handCount: number;
  pearls: number;
  loadedThisTide: number;
  /** Only known to yourself, a fellow Wrecker, or after the voyage. */
  wrecker?: boolean;
}

export interface CrateView {
  id: string;
  slots: number;
  tide: number;
  revealed: boolean;
  kind?: CardKind;
  mine: boolean;
}

export interface OfferView {
  id: string;
  from: string;
  to: string;
  give: { cards: CardView[]; pearls: number; pearlsReceived: number };
  want: Offer["want"];
  status: Offer["status"];
}

export interface GameView {
  code: string;
  you: string;
  hostId: string;
  phase: Phase;
  tide: number;
  totalTides: number;
  phaseEndsAt: number | null;
  phaseSeconds: number;
  flooded: Place[];
  nextFlood: Place | null;
  players: PlayerView[];
  hand: CardView[];
  hold: CrateView[];
  capacity: number;
  used: number;
  needs: Record<Supply, number>;
  supplies: Record<Supply, number>;
  offers: OfferView[];
  draws: Record<string, Draw>;
  log: LogEntry[];
  settings: Settings;
  wreckerCount: number;
  result: Result | null;
  round: number;
  /** Server clock when this view was sent, so timers line up across devices. */
  serverTime?: number;
}

function cardFor(c: Card, seeThrough: boolean): CardView {
  if (c.kind === "spoiled") {
    return seeThrough ? { id: c.id, kind: "spoiled", disguisedAs: c.looksLike } : { id: c.id, kind: c.looksLike ?? "fuel" };
  }
  return { id: c.id, kind: c.kind };
}

export function viewFor(s: GameState, pid: string): GameView {
  const me = player(s, pid);
  const over = s.phase === "voyage" || s.phase === "over";
  const knowsWreckers = !!me?.wrecker && wreckerCount(s) > 1;
  const revealPicks = s.phase !== "search";
  return {
    code: s.code,
    you: pid,
    hostId: s.hostId,
    phase: s.phase,
    tide: s.tide,
    totalTides: s.totalTides,
    phaseEndsAt: s.phaseEndsAt,
    phaseSeconds: phaseSeconds(s, s.phase),
    flooded: s.flooded,
    nextFlood: me?.role === "cartographer" && !over ? nextFlood(s) : null,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      role: p.role,
      bot: p.bot,
      connected: p.connected,
      ready: p.ready,
      done: p.done,
      picked: !!p.pick,
      pick: revealPicks || p.id === pid ? p.pick : null,
      handCount: p.hand.length,
      pearls: p.pearls,
      loadedThisTide: p.loadedThisTide,
      wrecker: over || p.id === pid || (knowsWreckers && p.wrecker) ? p.wrecker : undefined,
    })),
    hand: me ? me.hand.map((c) => cardFor(c, me.wrecker)) : [],
    hold: s.hold.map((c) => ({
      id: c.id,
      slots: CARD_INFO[c.card.kind].slots,
      tide: c.tide,
      revealed: c.revealed,
      kind: c.revealed ? c.card.kind : c.owner === pid ? (me?.wrecker ? c.card.kind : apparentKind(c.card)) : undefined,
      mine: c.owner === pid,
    })),
    capacity: s.capacity,
    used: slotsUsed(s.hold),
    needs: needsFor(s, true),
    supplies: suppliesIn(s.hold, true),
    offers: s.offers
      .filter((o) => o.from === pid || o.to === pid)
      .slice(-12)
      .map((o) => {
        const from = player(s, o.from);
        const cards = o.giveCards.map((c) => cardFor(c, (o.from === pid && !!me?.wrecker) || (o.to === pid && me?.role === "jeweler")));
        return {
          id: o.id,
          from: o.from,
          to: o.to,
          give: { cards, pearls: o.give.pearls, pearlsReceived: o.give.pearls * (from?.role === "duchess" ? 2 : 1) },
          want: o.want,
          status: o.status,
        };
      }),
    draws: revealPicks && s.draws[pid] ? { [pid]: s.draws[pid] } : {},
    log: s.log.slice(-30),
    settings: s.settings,
    wreckerCount: wreckerCount(s),
    result: over ? s.result : null,
    round: s.round,
  };
}
