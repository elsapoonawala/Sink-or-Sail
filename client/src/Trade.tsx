import { useState } from "react";
import { type GameView, type Kind, type Offer, KIND_INFO, KINDS } from "../../shared/game";
import { CardArt, PearlIcon } from "./art";
import { act } from "./net";
import { sfx } from "./sound";
import { Sheet, Stepper } from "./ui";

/** Face-to-face trade: offer what you carry and pearls, ask for what they carry. */
export function TradeComposer({ v, to, onClose }: { v: GameView; to: string; onClose: () => void }) {
  const [give, setGive] = useState<string[]>([]);
  const [pearls, setPearls] = useState(0);
  const [want, setWant] = useState<Partial<Record<Kind, number>>>({});
  const [wantPearls, setWantPearls] = useState(0);
  const me = v.players.find((p) => p.id === v.you)!;
  const them = v.players.find((p) => p.id === to);
  if (!them) return null;
  const theyHave = (k: Kind) => them.carry.filter((c) => c.kind === k).length;
  const nothing = !give.length && !pearls && !Object.values(want).some(Boolean) && !wantPearls;

  const send = async () => {
    const err = await act({ type: "offer", to, give: { itemIds: give, pearls }, want: { kinds: want as Record<string, number>, pearls: wantPearls } });
    if (!err) {
      sfx.trade();
      onClose();
    }
  };

  return (
    <Sheet title={`Trade with ${them.name}`} onClose={onClose} wide>
      <div className="composer">
        <section>
          <h4>You give</h4>
          {me.carry.length ? (
            <div className="pick-cards">
              {me.carry.map((c) => (
                <button key={c.id} className={`mini-card ${give.includes(c.id) ? "picked" : ""}`} onClick={() => setGive((g) => (g.includes(c.id) ? g.filter((x) => x !== c.id) : [...g, c.id]))} aria-pressed={give.includes(c.id)}>
                  <CardArt kind={c.kind} size={34} />
                  <span>{KIND_INFO[c.kind].name}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted small">Your hands are empty. You can still offer pearls.</p>
          )}
          <div className="row gap center-v">
            <PearlIcon /> <span>Pearls</span>
            <Stepper value={pearls} onChange={setPearls} max={me.pearls} label="pearls to give" />
            <span className="muted small">of {me.pearls}</span>
          </div>
        </section>
        <section>
          <h4>You ask for</h4>
          <p className="muted small">{them.name} is carrying {them.carry.length ? them.carry.map((c) => KIND_INFO[c.kind].name.toLowerCase()).join(", ") : "nothing"} and has {them.pearls} pearls.</p>
          <div className="want-grid">
            {KINDS.filter((k) => theyHave(k) > 0).map((k) => (
              <div key={k} className="want-item">
                <CardArt kind={k} size={30} />
                <span>{KIND_INFO[k].name}</span>
                <Stepper value={want[k] ?? 0} onChange={(n) => setWant((w) => ({ ...w, [k]: n }))} max={theyHave(k)} label={KIND_INFO[k].name} />
              </div>
            ))}
            <div className="want-item">
              <PearlIcon size={26} />
              <span>Pearls</span>
              <Stepper value={wantPearls} onChange={setWantPearls} max={them.pearls} label="pearls to ask for" />
            </div>
          </div>
        </section>
        <div className="row gap end">
          <button className="btn ghost" onClick={onClose}>Never mind</button>
          <button className="btn primary" onClick={send} disabled={nothing}>Offer the trade</button>
        </div>
      </div>
    </Sheet>
  );
}

function describe(kinds: Partial<Record<Kind, number>>, pearls: number) {
  const parts = KINDS.filter((k) => kinds[k]).map((k) => `${kinds[k]} ${KIND_INFO[k].name.toLowerCase()}`);
  if (pearls) parts.push(`${pearls} pearl${pearls > 1 ? "s" : ""}`);
  return parts.length ? parts.join(", ") : "nothing";
}

function gives(o: Offer) {
  const kinds: Partial<Record<Kind, number>> = {};
  for (const c of o.giveItems) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
  return describe(kinds, o.give.pearls);
}

export function OffersTray({ v }: { v: GameView }) {
  const name = (id: string) => v.players.find((p) => p.id === id)?.name ?? "Someone";
  const incoming = v.offers.filter((o) => o.to === v.you && o.status === "open");
  const outgoing = v.offers.filter((o) => o.from === v.you && o.status === "open");
  if (!incoming.length && !outgoing.length) return null;
  return (
    <div className="offers">
      {incoming.map((o) => (
        <div key={o.id} className="offer incoming">
          <p><b>{name(o.from)}</b> offers <b>{gives(o)}</b> for <b>{o.want.pearls || Object.keys(o.want.kinds).length ? describe(o.want.kinds, o.want.pearls) : "nothing (a gift)"}</b>.</p>
          <div className="row gap">
            <button className="btn primary small" onClick={async () => { if (!(await act({ type: "respond", offerId: o.id, accept: true }))) sfx.trade(); }}>Accept</button>
            <button className="btn ghost small" onClick={() => act({ type: "respond", offerId: o.id, accept: false })}>Decline</button>
          </div>
        </div>
      ))}
      {outgoing.map((o) => (
        <div key={o.id} className="offer outgoing">
          <p>Waiting for <b>{name(o.to)}</b> to answer.</p>
          <button className="btn ghost small" onClick={() => act({ type: "cancel", offerId: o.id })}>Cancel</button>
        </div>
      ))}
    </div>
  );
}
