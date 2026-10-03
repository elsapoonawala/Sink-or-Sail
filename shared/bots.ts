// Practice bots: simple, readable players so one person (or a judge) can try a full game.
import {
  type GameState, type Place, type Player, type Rng, type Supply,
  CARD_INFO, SUPPLIES, apparentKind, loadCard, needsFor, pickPlace, player, respondOffer, setDone,
  slotsUsed, suppliesIn, toggleReady,
} from "./game";

export const BOT_NAMES = ["Odette", "Augustin", "Ines", "Florian", "Margaux", "Teodor", "Beatrix", "Lucien"];

const SOURCE: Record<Supply, Place[]> = {
  fuel: ["harbour", "coves"],
  medicine: ["gardens", "hotel"],
  tools: ["hotel", "harbour"],
};

/** Supplies still missing once everything already in the hold is counted (face down too). */
function missing(s: GameState): Record<Supply, number> {
  const have = suppliesIn(s.hold, false);
  const needs = needsFor(s, false);
  const out = { fuel: 0, medicine: 0, tools: 0 } as Record<Supply, number>;
  for (const k of SUPPLIES) out[k] = Math.max(0, needs[k] - have[k]);
  return out;
}

function botPick(s: GameState, p: Player, rng: Rng): Place {
  const miss = missing(s);
  const ranked = SUPPLIES.filter((k) => miss[k] > 0).sort((a, b) => miss[b] - miss[a]);
  const options: Place[] = [];
  for (const k of ranked) options.push(...SOURCE[k]);
  if (p.role === "engineer" && miss.fuel) options.unshift("harbour");
  if (p.role === "physician" && miss.medicine) options.unshift("gardens");
  // A little greed keeps games interesting.
  if (rng() < 0.25 || !options.length) options.unshift(rng() < 0.5 ? "palace" : "market");
  const dry = options.filter((pl) => !s.flooded.includes(pl) || p.role === "diver");
  const list = dry.length ? dry : ["palace" as Place];
  return list[Math.floor(rng() * Math.min(2, list.length))];
}

/** One bot decision for the current phase. Returns true if it did something. */
export function botAct(s: GameState, pid: string, rng: Rng): boolean {
  const p = player(s, pid);
  if (!p || !p.bot) return false;
  switch (s.phase) {
    case "search":
      if (p.pick) return false;
      pickPlace(s, pid, botPick(s, p, rng));
      return true;
    case "trade": {
      let acted = false;
      for (const o of s.offers.filter((x) => x.to === pid && x.status === "open")) {
        const gets = o.give.cardIds.length + o.give.pearls / 2;
        const gives = Object.values(o.want.kinds).reduce((t, n) => t + (n ?? 0), 0) + o.want.pearls / 2;
        const accept = p.wrecker ? gets >= gives - 0.5 : gets >= gives;
        if (respondOffer(s, pid, o.id, accept)) respondOffer(s, pid, o.id, false);
        acted = true;
      }
      if (!p.done && !acted) {
        setDone(s, pid);
        return true;
      }
      return acted;
    }
    case "load": {
      if (p.done) return false;
      const miss = missing(s);
      const free = s.capacity - slotsUsed(s.hold);
      let card = p.wrecker
        ? p.hand.find((c) => c.kind === "spoiled") ?? p.hand.find((c) => c.kind === "diamond")
        : p.hand.find((c) => {
            const k = apparentKind(c);
            return (k === "fuel" || k === "medicine" || k === "tools") && miss[k] > 0;
          }) ?? p.hand.find((c) => c.kind === "compass");
      const stillNeeded = SUPPLIES.reduce((t, k) => t + miss[k], 0);
      if (!card && free - stillNeeded >= 2 + CARD_INFO.diamond.slots) card = p.hand.find((c) => c.kind === "diamond");
      if (card && !loadCard(s, pid, card.id)) return true;
      setDone(s, pid);
      return true;
    }
    case "flip": {
      const miss = missing(s);
      const met = SUPPLIES.every((k) => miss[k] === 0);
      const want = p.wrecker ? s.tide >= 2 && !met && rng() < 0.4 : met;
      if (want !== p.ready) {
        toggleReady(s, pid, want);
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}
