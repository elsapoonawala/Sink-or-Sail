import { describe, expect, it } from "vitest";
import {
  type GameState, addPlayer, advance, createGame, everyoneDone, loadCard, makeOffer, pickPlace,
  respondOffer, setDone, startGame, toggleReady, viewFor, slotsUsed,
} from "./game";
import { botAct } from "./bots";

function seeded(seed = 1) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

function game(n: number, opts: Partial<GameState["settings"]> = {}) {
  const s = createGame("ABCD", "p0");
  for (let i = 0; i < n; i++) addPlayer(s, `p${i}`, `Player ${i}`);
  Object.assign(s.settings, opts);
  const rng = seeded(7);
  expect(startGame(s, rng, 0)).toBeNull();
  return { s, rng };
}

/** Advance until the given phase. */
function until(s: GameState, rng: () => number, phase: GameState["phase"]) {
  for (let i = 0; i < 50 && s.phase !== phase; i++) advance(s, rng, 0);
  expect(s.phase).toBe(phase);
}

describe("setup", () => {
  it("needs two players", () => {
    const s = createGame("ABCD", "p0");
    addPlayer(s, "p0", "Solo");
    expect(startGame(s, seeded(), 0)).toMatch(/at least 2/);
  });

  it("has no wrecker below 5 players on auto, and one at 5", () => {
    expect(game(4).s.players.filter((p) => p.wrecker)).toHaveLength(0);
    expect(game(5).s.players.filter((p) => p.wrecker)).toHaveLength(1);
    expect(game(8).s.players.filter((p) => p.wrecker)).toHaveLength(2);
    expect(game(6, { wrecker: "off" }).s.players.filter((p) => p.wrecker)).toHaveLength(0);
  });

  it("gives wreckers two disguised spoiled crates", () => {
    const { s } = game(5);
    const w = s.players.find((p) => p.wrecker)!;
    expect(w.hand.filter((c) => c.kind === "spoiled")).toHaveLength(2);
    const other = s.players.find((p) => !p.wrecker)!;
    const v = viewFor(s, other.id);
    expect(v.players.find((p) => p.id === w.id)!.wrecker).toBeUndefined();
    const wv = viewFor(s, w.id);
    expect(wv.hand.some((c) => c.kind === "spoiled" && c.disguisedAs)).toBe(true);
  });

  it("quick mode has three tides", () => {
    expect(game(3, { quick: true }).s.totalTides).toBe(3);
  });
});

describe("tides", () => {
  it("runs search, trade and load, and floods from tide 2", () => {
    const { s, rng } = game(3);
    expect(s.flooded).toEqual([]);
    until(s, rng, "search");
    for (const p of s.players) pickPlace(s, p.id, "harbour");
    expect(everyoneDone(s)).toBe(true);
    advance(s, rng, 0); // reveal
    expect(s.players.every((p) => p.hand.length >= 3)).toBe(true);
    until(s, rng, "load");
    until(s, rng, "flip");
    advance(s, rng, 0);
    expect(s.tide).toBe(2);
    expect(s.flooded).toEqual(["coves"]);
  });

  it("hides other players' picks during the search", () => {
    const { s, rng } = game(3);
    until(s, rng, "search");
    pickPlace(s, "p1", "palace");
    const v = viewFor(s, "p0");
    expect(v.players[1].picked).toBe(true);
    expect(v.players[1].pick).toBeNull();
  });

  it("limits loading to two crates and to the hold's capacity", () => {
    const { s, rng } = game(2);
    until(s, rng, "load");
    const p = s.players[0];
    for (let i = 0; i < 4; i++) p.hand.push({ id: `x${i}`, kind: "fuel" });
    expect(loadCard(s, p.id, "x0")).toBeNull();
    expect(loadCard(s, p.id, "x1")).toBeNull();
    expect(loadCard(s, p.id, "x2")).toMatch(/2 crates/);
    s.hold.push(...Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, card: { id: `f${i}`, kind: "fuel" as const }, owner: "p1", tide: 1, revealed: true })));
    p.loadedThisTide = 0;
    expect(slotsUsed(s.hold)).toBe(12);
    expect(loadCard(s, p.id, "x2")).toMatch(/full/);
  });

  it("keeps crates face down until the tide ends", () => {
    const { s, rng } = game(2);
    until(s, rng, "load");
    s.players[0].hand.push({ id: "m1", kind: "medicine" });
    loadCard(s, "p0", "m1");
    expect(viewFor(s, "p1").hold[0].kind).toBeUndefined();
    expect(viewFor(s, "p0").hold[0].kind).toBe("medicine");
    advance(s, rng, 0);
    expect(viewFor(s, "p1").hold[0].kind).toBe("medicine");
    expect(viewFor(s, "p1").supplies.medicine).toBe(1);
  });

  it("sails early when more than half are ready", () => {
    const { s, rng } = game(3);
    until(s, rng, "flip");
    toggleReady(s, "p0", true);
    toggleReady(s, "p1", true);
    advance(s, rng, 0);
    expect(s.phase).toBe("voyage");
    expect(s.result?.sailedEarly).toBe(true);
  });

  it("always sails after the last tide", () => {
    const { s, rng } = game(2, { quick: true });
    for (let i = 0; i < 200 && s.phase !== "voyage"; i++) advance(s, rng, 0);
    expect(s.phase).toBe("voyage");
    expect(s.tide).toBe(3);
    expect(s.result?.success).toBe(false);
    expect(s.result?.winners).toBe("nobody");
  });
});

describe("trading", () => {
  it("swaps cards and pearls, with the Duchess bonus", () => {
    const { s, rng } = game(2);
    until(s, rng, "trade");
    const [a, b] = s.players;
    a.role = "duchess";
    a.hand = [{ id: "d1", kind: "diamond" }];
    b.hand = [{ id: "f1", kind: "fuel" }];
    a.pearls = 5;
    b.pearls = 0;
    expect(makeOffer(s, a.id, b.id, { cardIds: ["d1"], pearls: 2 }, { kinds: { fuel: 1 }, pearls: 0 })).toBeNull();
    const o = s.offers[0];
    expect(respondOffer(s, b.id, o.id, true)).toBeNull();
    expect(a.hand.map((c) => c.id)).toEqual(["f1"]);
    expect(b.hand.map((c) => c.id)).toEqual(["d1"]);
    expect(a.pearls).toBe(3);
    expect(b.pearls).toBe(4);
  });

  it("lets a Wrecker slip a spoiled crate in, which only the Jeweler can see", () => {
    const { s, rng } = game(5);
    until(s, rng, "trade");
    const w = s.players.find((p) => p.wrecker)!;
    const j = s.players.find((p) => !p.wrecker)!;
    j.role = "jeweler";
    w.hand = [{ id: "s1", kind: "spoiled", looksLike: "fuel" }, { id: "f9", kind: "fuel" }];
    j.hand = [{ id: "t1", kind: "tools" }];
    makeOffer(s, j.id, w.id, { cardIds: ["t1"], pearls: 0 }, { kinds: { fuel: 1 }, pearls: 0 });
    respondOffer(s, w.id, s.offers[0].id, true);
    expect(j.hand.map((c) => c.id)).toEqual(["s1"]);
    // An offer from the Wrecker shows the Jeweler the truth, but not anyone else.
    const other = s.players.find((p) => !p.wrecker && p.id !== j.id)!;
    w.hand.push({ id: "s2", kind: "spoiled", looksLike: "medicine" });
    makeOffer(s, w.id, j.id, { cardIds: ["s2"], pearls: 0 }, { kinds: {}, pearls: 1 });
    makeOffer(s, w.id, other.id, { cardIds: ["s2"], pearls: 0 }, { kinds: {}, pearls: 1 });
    expect(viewFor(s, j.id).offers.at(-1)!.give.cards[0].kind).toBe("spoiled");
    expect(viewFor(s, other.id).offers.at(-1)!.give.cards[0].kind).toBe("medicine");
  });

  it("refuses an acceptance the receiver can't pay for", () => {
    const { s, rng } = game(2);
    until(s, rng, "trade");
    const [a, b] = s.players;
    a.hand = [{ id: "d1", kind: "diamond" }];
    b.hand = [];
    makeOffer(s, a.id, b.id, { cardIds: ["d1"], pearls: 0 }, { kinds: { fuel: 1 }, pearls: 0 });
    expect(respondOffer(s, b.id, s.offers[0].id, true)).toMatch(/don't have/);
    expect(s.offers[0].status).toBe("open");
  });
});

describe("the crossing", () => {
  it("islanders win with supplies met; the biggest fortune is crowned", () => {
    const { s, rng } = game(3);
    until(s, rng, "flip");
    const crate = (kind: "fuel" | "medicine" | "tools" | "diamond", owner: string, i: number) => ({ id: `z${kind}${i}`, card: { id: `z${kind}${i}`, kind }, owner, tide: 1, revealed: true });
    s.hold = [
      ...[0, 1, 2, 3].map((i) => crate("fuel", "p0", i)),
      ...[0, 1, 2].map((i) => crate("medicine", "p1", i)),
      ...[0, 1].map((i) => crate("tools", "p2", i)),
      crate("diamond", "p2", 9),
    ];
    s.players.forEach((p) => { p.pearls = 1; p.ready = true; });
    advance(s, rng, 0);
    expect(s.result?.success).toBe(true);
    expect(s.result?.winners).toBe("islanders");
    expect(s.result?.grandFortune).toEqual(["p2"]);
  });

  it("bots can play a whole game to the end", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = createGame("BOTS", "b0");
      for (let i = 0; i < 6; i++) addPlayer(s, `b${i}`, `Bot ${i}`, true);
      const rng = seeded(seed);
      startGame(s, rng, 0);
      for (let i = 0; i < 400 && s.phase !== "voyage"; i++) {
        for (const p of s.players) botAct(s, p.id, rng);
        if (s.phase === "trade") s.players.forEach((p) => setDone(s, p.id));
        advance(s, rng, 0);
      }
      expect(s.phase).toBe("voyage");
      expect(s.result).not.toBeNull();
    }
  });
});
