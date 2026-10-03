import { useState } from "react";
import { CARD_INFO, type GameView, type OfferView, type Wantable, WANTABLE } from "../../shared/game";
import { CardArt, PearlIcon, Portrait } from "./art";
import { act } from "./net";
import { sfx } from "./sound";
import { Sheet, Stepper } from "./ui";

export function TradeComposer({ v, to: initialTo, onClose }: { v: GameView; to: string | null; onClose: () => void }) {
  const [to, setTo] = useState<string | null>(initialTo);
  const [give, setGive] = useState<string[]>([]);
  const [pearls, setPearls] = useState(0);
  const [want, setWant] = useState<Partial<Record<Wantable, number>>>({});
  const [wantPearls, setWantPearls] = useState(0);
  const me = v.players.find((p) => p.id === v.you)!;
  const others = v.players.filter((p) => p.id !== v.you);
  const target = v.players.find((p) => p.id === to);
  const nothing = !give.length && !pearls && !Object.values(want).some(Boolean) && !wantPearls;

  const send = async () => {
    if (!to) return;
    const err = await act({ type: "offer", to, give: { cardIds: give, pearls }, want: { kinds: want as Record<string, number>, pearls: wantPearls } });
    if (!err) {
      sfx.trade();
      onClose();
    }
  };

  return (
    <Sheet title={target ? `Offer to ${target.name}` : "Make an offer"} onClose={onClose} wide>
      {!target ? (
        <div className="pick-player">
          <p className="muted">Who do you want to trade with?</p>
          <div className="pick-grid">
            {others.map((p) => (
              <button key={p.id} className="pick-tile" onClick={() => setTo(p.id)}>
                <Portrait role={p.role} seat={p.seat} size={56} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="composer">
          <section>
            <h4>You give</h4>
            {v.hand.length ? (
              <div className="pick-cards">
                {v.hand.map((c) => (
                  <button key={c.id} className={`mini-card ${give.includes(c.id) ? "picked" : ""}`} onClick={() => setGive((g) => (g.includes(c.id) ? g.filter((x) => x !== c.id) : [...g, c.id]))} aria-pressed={give.includes(c.id)}>
                    <CardArt kind={c.kind} size={34} />
                    <span>{CARD_INFO[c.kind].name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted small">Your hand is empty. You can still offer pearls.</p>
            )}
            <div className="row gap center-v">
              <PearlIcon /> <span>Pearls</span>
              <Stepper value={pearls} onChange={setPearls} max={me.pearls} label="pearls to give" />
              <span className="muted small">of {me.pearls}{me.role === "duchess" && pearls ? ` · they receive ${pearls * 2}` : ""}</span>
            </div>
          </section>
          <section>
            <h4>You ask for</h4>
            <div className="want-grid">
              {WANTABLE.map((k) => (
                <div key={k} className="want-item">
                  <CardArt kind={k} size={30} />
                  <span>{CARD_INFO[k].name}</span>
                  <Stepper value={want[k] ?? 0} onChange={(n) => setWant((w) => ({ ...w, [k]: n }))} max={k === "compass" ? 1 : 4} label={CARD_INFO[k].name} />
                </div>
              ))}
              <div className="want-item">
                <PearlIcon size={26} />
                <span>Pearls</span>
                <Stepper value={wantPearls} onChange={setWantPearls} max={20} label="pearls to ask for" />
              </div>
            </div>
          </section>
          <div className="row gap end">
            <button className="btn ghost" onClick={() => setTo(null)}>Change player</button>
            <button className="btn primary" onClick={send} disabled={nothing}>Send offer</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function describeWant(o: OfferView): string {
  const parts = WANTABLE.filter((k) => o.want.kinds[k]).map((k) => `${o.want.kinds[k]} ${CARD_INFO[k].name.toLowerCase()}`);
  if (o.want.pearls) parts.push(`${o.want.pearls} pearl${o.want.pearls > 1 ? "s" : ""}`);
  return parts.length ? parts.join(", ") : "nothing (a gift)";
}

function GiveList({ o }: { o: OfferView }) {
  return (
    <span className="give-list">
      {o.give.cards.map((c) => (
        <span key={c.id} className={`give-chip ${c.kind === "spoiled" ? "spoiled" : ""}`}>
          <CardArt kind={c.kind} size={22} /> {c.kind === "spoiled" ? `Spoiled (looks like ${c.disguisedAs})` : CARD_INFO[c.kind].name}
        </span>
      ))}
      {o.give.pearls > 0 && <span className="give-chip"><PearlIcon size={14} /> {o.give.pearlsReceived} pearl{o.give.pearlsReceived > 1 ? "s" : ""}</span>}
      {!o.give.cards.length && !o.give.pearls && <span className="give-chip muted">nothing</span>}
    </span>
  );
}

export function OffersTray({ v }: { v: GameView }) {
  const name = (id: string) => v.players.find((p) => p.id === id)?.name ?? "Someone";
  const incoming = v.offers.filter((o) => o.to === v.you && o.status === "open");
  const outgoing = v.offers.filter((o) => o.from === v.you && o.status === "open");
  const recent = v.offers.filter((o) => o.status !== "open").slice(-3).reverse();
  if (!incoming.length && !outgoing.length && !recent.length) return null;
  return (
    <div className="offers">
      {incoming.map((o) => (
        <div key={o.id} className="offer incoming">
          <p><b>{name(o.from)}</b> offers <GiveList o={o} /> for <b>{describeWant(o)}</b>.</p>
          <div className="row gap">
            <button className="btn primary small" onClick={async () => { if (!(await act({ type: "respond", offerId: o.id, accept: true }))) sfx.trade(); }}>Accept</button>
            <button className="btn ghost small" onClick={() => act({ type: "respond", offerId: o.id, accept: false })}>Decline</button>
          </div>
        </div>
      ))}
      {outgoing.map((o) => (
        <div key={o.id} className="offer outgoing">
          <p>Waiting for <b>{name(o.to)}</b>: <GiveList o={o} /> for {describeWant(o)}.</p>
          <button className="btn ghost small" onClick={() => act({ type: "cancel", offerId: o.id })}>Cancel</button>
        </div>
      ))}
      {recent.map((o) => (
        <p key={o.id} className={`offer-done ${o.status}`}>
          {o.from === v.you ? `Your offer to ${name(o.to)}` : `${name(o.from)}'s offer`} was {o.status === "failed" ? "no longer possible" : o.status}.
        </p>
      ))}
    </div>
  );
}
