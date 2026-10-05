import { describe, expect, it } from "vitest";
import {
  type GameState, addPlayer, accuse, castVote, createGame, makeOffer, moveTo, needsFor, player, respondOffer,
  setReady, startGame, strike, tick, viewFor, KNOCKOUT_MS, NEEDS, SAIL_COUNTDOWN, WAVES,
} from "./game";
import { botTick, newBrain } from "./bots";
import { DOCK, GANGWAY, ZONES, elev, floodsAtTide, footing, seaLevel, tideLevel } from "./world";

const PIER_SPOT = { x: (DOCK.x1 + DOCK.x2) / 2, y: DOCK.y1 + 60 };

const seeded = (n = 1) => () => ((n = (n * 16807) % 2147483647) / 2147483647);

function game(players = 2, opts: Partial<GameState["settings"]> = {}) {
  const s = createGame("TEST", "p0");
  Object.assign(s.settings, opts);
  for (let i = 0; i < players; i++) addPlayer(s, `p${i}`, `Player ${i}`, i > 0);
  startGame(s, seeded(), 1_000_000);
  return s;
}

describe("the island", () => {
  it("floods low places first and keeps the palace dry", () => {
    expect(floodsAtTide("shipwreck", 5)).toBe(2);
    expect(floodsAtTide("coves", 5)).toBe(3);
    expect(floodsAtTide("market", 5)).toBe(4);
    expect(floodsAtTide("gardens", 5)).toBe(5);
    expect(floodsAtTide("palace", 5)).toBe(0);
    expect(elev(ZONES.palace.x, ZONES.palace.y)).toBeGreaterThan(6);
  });

  it("raises the water smoothly at the start of each tide", () => {
    expect(seaLevel(1, 0, 5, 5000)).toBe(0);
    expect(seaLevel(2, 0, 5, 0)).toBeCloseTo(tideLevel(1, 5));
    expect(seaLevel(2, 0, 5, 60_000)).toBeCloseTo(tideLevel(2, 5));
  });

  it("keeps the pier walkable even at the last tide", () => {
    expect(footing(PIER_SPOT.x, PIER_SPOT.y, { level: 4, secretFound: false, caveOpen: false })).toBe(1);
  });
});

describe("a game", () => {
  it("starts everyone at the harbour with a character and crates on the island", () => {
    const s = game(3);
    expect(s.phase).toBe("play");
    expect(s.players.every((p) => p.role)).toBe(true);
    expect(s.crates.length).toBeGreaterThan(3);
    expect(needsFor(s)).toEqual({ ...NEEDS, fuel: NEEDS.fuel });
  });

  it("lets you pick up a crate by walking into it and load it at the gangway", () => {
    const s = game(1);
    const me = player(s, "p0")!;
    const crate = s.crates.find((c) => c.kind === "fuel")!;
    me.x = crate.x;
    me.y = crate.y;
    tick(s, 1_000_100, seeded());
    expect(me.carry.map((c) => c.kind)).toContain("fuel");
    me.x = GANGWAY.x;
    me.y = GANGWAY.y;
    tick(s, 1_000_200, seeded());
    expect(me.carry).toHaveLength(0);
    expect(s.hold.some((c) => c.kind === "fuel" && c.owner === "p0")).toBe(true);
  });

  it("rejects moves that are too fast or into the sea", () => {
    const s = game(1);
    const me = player(s, "p0")!;
    const { x, y } = me;
    expect(moveTo(s, "p0", x + 2000, y, 0, true, 1_000_100)).toBe(false);
    expect(moveTo(s, "p0", 50, 50, 0, true, 1_010_000)).toBe(false);
    expect(moveTo(s, "p0", x + 10, y, 0, true, 1_000_200)).toBe(true);
  });

  it("sails after the last tide and leaves behind anyone off the pier", () => {
    const s = game(2);
    const [a, b] = s.players;
    a.x = PIER_SPOT.x;
    a.y = PIER_SPOT.y;
    b.x = ZONES.palace.x;
    b.y = ZONES.palace.y + 60;
    tick(s, s.endsAt + 1, seeded());
    expect(s.phase).toBe("sailing");
    const fa = s.result!.fortunes.find((f) => f.id === a.id)!;
    const fb = s.result!.fortunes.find((f) => f.id === b.id)!;
    expect(fa.aboard).toBe(true);
    expect(fb.aboard).toBe(false);
  });

  it("counts down to an early departure once most players are ready on the pier", () => {
    const s = game(2);
    for (const p of s.players) {
      p.x = PIER_SPOT.x;
      p.y = PIER_SPOT.y;
      expect(setReady(s, p.id, true)).toBeNull();
    }
    tick(s, 1_001_000, seeded());
    expect(s.sailAt).toBe(1_001_000 + SAIL_COUNTDOWN);
    tick(s, 1_001_000 + SAIL_COUNTDOWN + 1, seeded());
    expect(s.phase).toBe("sailing");
    expect(s.result!.early).toBe(true);
  });

  it("swaps carried crates face to face", () => {
    const s = game(2);
    const [a, b] = s.players;
    b.x = a.x + 20;
    b.y = a.y;
    a.carry = [{ id: "x1", kind: "fuel" }];
    b.carry = [{ id: "x2", kind: "tools" }];
    expect(makeOffer(s, a.id, b.id, { itemIds: ["x1"], pearls: 0 }, { kinds: { tools: 1 }, pearls: 0 }, 1_000_100)).toBeNull();
    expect(respondOffer(s, b.id, s.offers[0].id, true)).toBeNull();
    expect(a.carry[0].kind).toBe("tools");
    expect(b.carry[0].kind).toBe("fuel");
  });

  it("hides who the Wrecker is, and a vote can lock them in the brig", () => {
    const s = game(5, { wrecker: "on" });
    const w = s.players.find((p) => p.wrecker)!;
    const other = s.players.find((p) => !p.wrecker)!;
    expect(viewFor(s, other.id).players.find((p) => p.id === w.id)!.wrecker).toBeUndefined();
    expect(accuse(s, other.id, w.id, 1_000_100)).toBeNull();
    for (const p of s.players) if (p.id !== w.id) castVote(s, p.id, true, 1_000_200);
    expect(w.brig).toBe(true);
    expect(s.vote!.outcome).toBe("jailed");
  });
});

describe("crates, pearls and the cutlass", () => {
  it("starts with two waves of crates and washes up the third later in the tide", () => {
    const s = game(1);
    const first = s.crates.filter((c) => c.zone !== "cave").length;
    expect(first).toBeGreaterThanOrEqual(7);
    tick(s, s.tideStartedAt + s.tideMs / WAVES + 1, seeded());
    expect(s.crates.filter((c) => c.zone !== "cave").length).toBe(first);
    tick(s, s.tideStartedAt + (2 * s.tideMs) / WAVES + 1, seeded());
    expect(s.crates.filter((c) => c.zone !== "cave").length).toBeGreaterThanOrEqual(11);
    expect(s.piles.length).toBeGreaterThanOrEqual(6);
    tick(s, s.tideStartedAt + s.tideMs + 1, seeded());
    expect(s.tide).toBe(2);
    expect(s.spawnedPart).toBe(0);
  });

  it("pays a pearl for each spare supply loaded", () => {
    const s = game(1);
    const me = player(s, "p0")!;
    for (let i = 0; i < NEEDS.fuel; i++) s.hold.push({ id: `h${i}`, kind: "fuel", owner: "p0" });
    me.carry = [{ id: "x", kind: "fuel" }];
    const before = me.pearls;
    me.x = GANGWAY.x;
    me.y = GANGWAY.y;
    tick(s, 1_000_100, seeded());
    expect(me.carry).toHaveLength(0);
    expect(me.pearls).toBe(before + 1);
  });

  it("knocks a player out with a cutlass and spills their cargo", () => {
    const s = game(2);
    const [a, b] = s.players;
    b.x = a.x + 30;
    b.y = a.y;
    a.carry = [{ id: "k", kind: "cutlass" }];
    b.carry = [{ id: "f", kind: "fuel" }, { id: "m", kind: "medicine" }];
    const crates = s.crates.length;
    expect(strike(s, a.id, b.id, 1_000_100)).toBeNull();
    expect(a.carry).toHaveLength(0);
    expect(b.carry).toHaveLength(0);
    expect(s.crates.length).toBe(crates + 2);
    expect(moveTo(s, b.id, b.x + 5, b.y, 0, true, 1_000_200)).toBe(false);
    a.carry = [{ id: "k2", kind: "cutlass" }];
    expect(strike(s, a.id, b.id, 1_000_300)).not.toBeNull();
    tick(s, 1_000_100 + KNOCKOUT_MS + 10, seeded());
    expect(b.downUntil).toBe(0);
  });

  it("deals everyone a private order and pays pearls when they load it themselves", () => {
    const s = game(2);
    const [a, b] = s.players;
    expect(a.order).not.toBeNull();
    expect(viewFor(s, b.id).players.find((p) => p.id === a.id)!.order).toBeUndefined();
    expect(viewFor(s, a.id).players.find((p) => p.id === a.id)!.order).toEqual(a.order);
    a.carry = (Object.entries(a.order!.want) as [string, number][]).flatMap(([k, n]) => Array.from({ length: n }, (_, i) => ({ id: `${k}${i}`, kind: k as "fuel" })));
    const before = a.pearls;
    a.x = GANGWAY.x;
    a.y = GANGWAY.y;
    tick(s, 1_000_100, seeded());
    expect(a.order!.done).toBe(true);
    expect(a.pearls).toBe(before + a.order!.reward);
    const bOrder = b.order;
    tick(s, s.tideStartedAt + s.tideMs + 1, seeded());
    expect(a.order!.done).toBe(false);
    expect(a.order!.tide).toBe(2);
    expect(b.order).toBe(bOrder); // unfinished orders carry over
  });

  it("puts crates with your name near you that only you can pick up", () => {
    const s = game(2);
    const [person, bot] = s.players;
    const mine = s.crates.filter((c) => c.owner === person.id);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(s.crates.some((c) => c.owner === bot.id)).toBe(false);
    bot.x = mine[0].x;
    bot.y = mine[0].y;
    tick(s, 1_000_100, seeded());
    expect(bot.carry).toHaveLength(0);
  });

  it("lets you trade with someone across the island", () => {
    const s = game(2);
    const [a, b] = s.players;
    b.x = a.x + 900;
    a.carry = [{ id: "x1", kind: "fuel" }];
    b.carry = [{ id: "x2", kind: "tools" }];
    expect(makeOffer(s, a.id, b.id, { itemIds: ["x1"], pearls: 0 }, { kinds: { tools: 1 }, pearls: 0 }, 1_000_100)).toBeNull();
    expect(respondOffer(s, b.id, s.offers[0].id, true)).toBeNull();
    expect(a.carry[0].kind).toBe("tools");
  });

  it("never loads the cutlass into the hold", () => {
    const s = game(1);
    const me = player(s, "p0")!;
    me.carry = [{ id: "k", kind: "cutlass" }];
    me.x = GANGWAY.x;
    me.y = GANGWAY.y;
    tick(s, 1_000_100, seeded());
    expect(me.carry.map((c) => c.kind)).toEqual(["cutlass"]);
  });
});

describe("bots", () => {
  it("load the ferry on their own", () => {
    const s = game(4);
    const rng = seeded(7);
    const brains = new Map(s.players.map((p) => [p.id, newBrain()]));
    let now = 1_000_000;
    for (let i = 0; i < 1800 && s.phase === "play"; i++) {
      now += 100;
      const claimed = new Set<string>();
      for (const p of s.players) if (p.bot) botTick(s, p, brains.get(p.id)!, now, 0.1, rng, claimed);
      tick(s, now, rng);
    }
    expect(s.hold.length).toBeGreaterThan(3);
  });
});
