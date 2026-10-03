import { useEffect, useMemo, useRef, useState } from "react";
import { CARD_INFO, type CardView, type GameView, type Place, PLACE_INFO, PLACES, ROLE_INFO, SUPPLIES } from "../../shared/game";
import { CardArt, IslandMap, PearlIcon, Portrait } from "./art";
import { ChatPanel, CommsPanel, ShipLog, SignalBar, VoicePanel } from "./Comms";
import { HowTo } from "./HowTo";
import { act, leaveRoom, setChatOpen, toast, useStore } from "./net";
import { Allegiance, PlayerChip, PlayerSheet } from "./People";
import { setSound, sfx, soundOn } from "./sound";
import { OffersTray, TradeComposer } from "./Trade";
import { Dial, Icon, MuteButton, Sheet } from "./ui";

const PHASE_COPY: Record<string, { title: string; hint: string }> = {
  flood: { title: "The tide rises", hint: "Watch the island. One place floods every tide." },
  search: { title: "Search the island", hint: "Tap a place on the map. Flooded places give 1 card." },
  reveal: { title: "The search party returns", hint: "Here's what you found." },
  trade: { title: "Trade", hint: "Tap a player to swap cards. Pearls sweeten a deal." },
  load: { title: "Load the ferry", hint: "Tap a card, then load it. Up to 2 per tide." },
  flip: { title: "The crates are opened", hint: "Enough aboard? Tap Ready to leave." },
};

const SUPPLY_LABEL = { fuel: "Fuel", medicine: "Medicine", tools: "Tools" } as const;

export function Game({ v }: { v: GameView }) {
  const { unread } = useStore();
  const me = v.players.find((p) => p.id === v.you)!;
  const [sheet, setSheet] = useState<null | "comms" | "help" | "places" | "role" | "menu">(null);
  const [player, setPlayer] = useState<string | null>(null);
  const [tradeTo, setTradeTo] = useState<string | null | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const [sound, setSoundState] = useState(soundOn());
  const copy = PHASE_COPY[v.phase] ?? { title: "", hint: "" };

  usePhaseEffects(v, () => setSheet("role"));

  // Keep the selection valid as the hand changes.
  useEffect(() => {
    if (selected && !v.hand.some((c) => c.id === selected)) setSelected(null);
  }, [v.hand, selected]);
  useEffect(() => setChatOpen(sheet === "comms"), [sheet]);

  const others = v.players.filter((p) => p.id !== v.you);
  const readyCount = v.players.filter((p) => p.ready).length;
  const picks = v.players.filter((p) => p.pick && (v.phase !== "search" || p.id === v.you)).map((p) => ({ place: p.pick as Place, seat: p.seat, name: p.name }));

  const pick = (place: Place) => {
    sfx.click();
    act({ type: "pick", place });
    setSheet(null);
  };

  const load = async () => {
    if (!selected) return;
    const err = await act({ type: "load", cardId: selected });
    if (!err) {
      sfx.thud();
      setSelected(null);
    }
  };

  const cta = (() => {
    switch (v.phase) {
      case "flood":
        return { label: "The tide is rising…", disabled: true };
      case "search":
        return me.pick
          ? { label: `Searching ${PLACE_INFO[me.pick].name} · tap to change`, onClick: () => setSheet("places"), quiet: true }
          : { label: "Choose a place to search", onClick: () => setSheet("places") };
      case "reveal":
        return { label: "Unpacking your finds…", disabled: true };
      case "trade":
        return me.done
          ? { label: "Done trading · tap to reopen", onClick: () => act({ type: "done", done: false }), quiet: true }
          : { label: "Make an offer", onClick: () => setTradeTo(null) };
      case "load": {
        const sel = v.hand.find((c) => c.id === selected);
        if (me.done || me.loadedThisTide >= 2) return { label: me.loadedThisTide ? "Loaded · waiting for the others" : "Done · waiting for the others", disabled: true, quiet: true };
        if (sel) return { label: `Load ${CARD_INFO[sel.kind === "spoiled" ? "spoiled" : sel.kind].name} onto the ferry`, onClick: load };
        return { label: v.hand.length ? "Tap a card in your hand to load it" : "Nothing to load", disabled: true, quiet: true };
      }
      case "flip":
        return me.ready
          ? { label: `You're ready to leave · ${readyCount} of ${v.players.length}`, onClick: () => act({ type: "ready", ready: false }), quiet: true }
          : { label: `Ready to leave? (${readyCount} of ${v.players.length} ready)`, onClick: () => { sfx.click(); act({ type: "ready", ready: true }); } };
      default:
        return { label: "", disabled: true };
    }
  })() as { label: string; onClick?: () => void; disabled?: boolean; quiet?: boolean };

  const secondary = (() => {
    if (v.phase === "trade" && !me.done) return { label: "Done trading", onClick: () => act({ type: "done", done: true }) };
    if (v.phase === "load" && !me.done && me.loadedThisTide < 2) return { label: me.loadedThisTide ? "Done loading" : "Skip loading", onClick: () => act({ type: "done", done: true }) };
    return null;
  })();

  return (
    <main className={`game phase-${v.phase}`}>
      <header className="topbar">
        <div className="tides" aria-label={`Tide ${v.tide} of ${v.totalTides}`}>
          <span className="eyebrow">Tide</span>
          <div className="tide-pips">
            {Array.from({ length: v.totalTides }, (_, i) => (
              <span key={i} className={i + 1 < v.tide ? "past" : i + 1 === v.tide ? "now" : ""}>{i + 1}</span>
            ))}
          </div>
        </div>
        <div className="phase-title">
          <h1>{copy.title}</h1>
          <p>{copy.hint}</p>
        </div>
        <Dial endsAt={v.phaseEndsAt} total={v.phaseSeconds} />
        <div className="top-tools">
          <button className="icon-btn" onClick={() => setSheet("help")} aria-label="How to play"><Icon name="help" /></button>
          <button className="icon-btn" onClick={() => { setSound(!sound); setSoundState(!sound); }} aria-label={sound ? "Sound off" : "Sound on"}>
            <Icon name={sound ? "sound" : "soundOff"} />
          </button>
          <button className="icon-btn" onClick={() => setSheet("menu")} aria-label="Room menu"><span className="code-mini">{v.code}</span></button>
        </div>
      </header>

      <nav className="strip" aria-label="Players">
        <PlayerChip v={v} p={me} onOpen={() => setSheet("role")} />
        {others.map((p) => (
          <PlayerChip key={p.id} v={v} p={p} onOpen={(id) => (v.phase === "trade" ? setTradeTo(id) : setPlayer(id))} />
        ))}
      </nav>

      <section className="board">
        <div className="map-wrap">
          <IslandMap
            flooded={v.flooded}
            tide={v.tide}
            total={v.totalTides}
            onPick={pick}
            picks={picks}
            myPick={me.pick}
            selectable={v.phase === "search"}
            nextFlood={v.nextFlood}
            holdFill={v.used / v.capacity}
          />
          <a className="mini-gauges" href="#ferry" aria-label="Ferry supplies">
            {SUPPLIES.map((k) => (
              <span key={k} className={v.supplies[k] >= v.needs[k] ? "ok" : ""}><CardArt kind={k} size={16} /> {v.supplies[k]}/{v.needs[k]}</span>
            ))}
            <span className="slots">{v.used}/{v.capacity}</span>
          </a>
          {v.nextFlood && v.phase !== "flip" && <p className="foresight">Your foresight: <b>{PLACE_INFO[v.nextFlood].name}</b> floods next.</p>}
        </div>
        <FerryPanel v={v} />
      </section>

      {v.phase === "trade" && <OffersTray v={v} />}

      <section className="hand-wrap" aria-label="Your hand">
        <div className="hand-head">
          <span className="eyebrow">Your hand</span>
          <span className="pearls"><PearlIcon /> {me.pearls} pearl{me.pearls === 1 ? "" : "s"}</span>
          {v.phase === "load" && <span className="small muted">{me.loadedThisTide} of 2 loaded this tide</span>}
        </div>
        <Hand v={v} selected={selected} onSelect={(id) => { if (v.phase === "load" && !me.done && me.loadedThisTide < 2) { sfx.click(); setSelected(selected === id ? null : id); } }} />
      </section>

      <aside className="side">
        <ShipLog v={v} />
        <CommsPanel v={v} />
      </aside>

      <footer className="actionbar">
        <MuteButton big />
        <div className="cta-stack">
          <button className={`btn cta ${cta.quiet ? "quiet" : ""}`} onClick={cta.onClick} disabled={cta.disabled}>{cta.label}</button>
          {secondary && <button className="btn ghost small" onClick={secondary.onClick}>{secondary.label}</button>}
        </div>
        <button className="icon-btn chat-btn" onClick={() => setSheet("comms")} aria-label="Chat and signals">
          <Icon name="chat" />
          {unread > 0 && <span className="unread">{unread}</span>}
        </button>
      </footer>

      {v.phase === "flood" && <FloodBanner v={v} />}
      {v.phase === "reveal" && <DrawReveal v={v} />}
      {v.phase === "flip" && <FlipReveal v={v} />}

      {sheet === "places" && (
        <Sheet title="Where will you search?" onClose={() => setSheet(null)}>
          <div className="place-list">
            {PLACES.map((pl) => {
              const fl = v.flooded.includes(pl);
              return (
                <button key={pl} className={`place-row ${me.pick === pl ? "on" : ""} ${fl ? "flooded" : ""}`} onClick={() => pick(pl)}>
                  <b>{PLACE_INFO[pl].name}</b>
                  <span>{PLACE_INFO[pl].yields}</span>
                  <small>{fl ? (me.role === "diver" ? "Flooded, but you dive at full strength" : "Flooded: 1 card") : PLACE_INFO[pl].blurb}</small>
                  {v.nextFlood === pl && <small className="next">Floods next tide</small>}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
      {sheet === "comms" && (
        <Sheet title="Talk to the table" onClose={() => setSheet(null)}>
          <VoicePanel />
          <SignalBar />
          <ChatPanel v={v} />
        </Sheet>
      )}
      {sheet === "help" && (
        <Sheet title="How to play" onClose={() => setSheet(null)} wide>
          <HowTo />
        </Sheet>
      )}
      {sheet === "role" && me.role && (
        <Sheet title="Your role" onClose={() => setSheet(null)}>
          <div className="player-sheet">
            <Portrait role={me.role} seat={me.seat} size={110} />
            <div className="ps-info">
              <h4>{ROLE_INFO[me.role].name}</h4>
              <p className="muted small">{ROLE_INFO[me.role].wear}</p>
              <p><b className="tag">{ROLE_INFO[me.role].short}</b> {ROLE_INFO[me.role].power}</p>
            </div>
          </div>
          <Allegiance wrecker={!!me.wrecker} count={v.wreckerCount} />
          <button className="btn primary" onClick={() => setSheet(null)}>Got it</button>
        </Sheet>
      )}
      {sheet === "menu" && (
        <Sheet title={`Room ${v.code}`} onClose={() => setSheet(null)}>
          <p>Friends can't join mid-game, but anyone who drops out can reopen the link to get their seat back.</p>
          <button className="btn ghost danger" onClick={leaveRoom}>Leave this game</button>
        </Sheet>
      )}
      {player && <PlayerSheet v={v} pid={player} onClose={() => setPlayer(null)} onOffer={(id) => setTradeTo(id)} />}
      {tradeTo !== undefined && v.phase === "trade" && <TradeComposer v={v} to={tradeTo} onClose={() => setTradeTo(undefined)} />}
    </main>
  );
}

function Hand({ v, selected, onSelect }: { v: GameView; selected: string | null; onSelect: (id: string) => void }) {
  const sorted = useMemo(() => {
    const order = ["fuel", "medicine", "tools", "compass", "diamond", "spoiled"];
    return [...v.hand].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  }, [v.hand]);
  if (!sorted.length) return <p className="empty-hand muted">No cards yet. Search the island to find some.</p>;
  return (
    <div className="hand">
      {sorted.map((c) => (
        <HandCard key={c.id} c={c} selected={selected === c.id} loadable={v.phase === "load"} onClick={() => onSelect(c.id)} />
      ))}
    </div>
  );
}

function HandCard({ c, selected, loadable, onClick }: { c: CardView; selected: boolean; loadable: boolean; onClick: () => void }) {
  const info = CARD_INFO[c.kind];
  return (
    <button className={`card ${selected ? "selected" : ""} ${loadable ? "loadable" : ""} ${c.kind}`} onClick={onClick} aria-pressed={selected} aria-label={c.kind === "spoiled" ? `Spoiled crate disguised as ${c.disguisedAs}` : info.name}>
      <CardArt kind={c.kind} size={46} />
      <span className="card-name">{c.kind === "spoiled" ? "Spoiled" : info.name}</span>
      <span className="card-meta">
        {c.kind === "spoiled" ? `looks like ${c.disguisedAs}` : c.kind === "diamond" ? "worth 3 · 2 slots" : c.kind === "compass" ? "−1 fuel needed" : "supply"}
      </span>
    </button>
  );
}

function FerryPanel({ v }: { v: GameView }) {
  const me = v.players.find((p) => p.id === v.you)!;
  const ready = v.players.filter((p) => p.ready).length;
  const slots: { key: string; span: number; kind?: string; revealed: boolean; mine: boolean; fresh: boolean }[] = v.hold.map((c) => ({
    key: c.id, span: c.slots, kind: c.kind, revealed: c.revealed, mine: c.mine, fresh: c.tide === v.tide,
  }));
  const free = Math.max(0, v.capacity - v.used);
  const compass = v.hold.some((c) => c.revealed && c.kind === "compass");
  return (
    <div className="ferry-panel" id="ferry">
      <div className="fp-head">
        <h2>The <em>Saltmere Queen</em></h2>
        <span className="small muted">{v.used} of {v.capacity} slots</span>
      </div>
      <div className="gauges">
        {SUPPLIES.map((k) => {
          const have = v.supplies[k];
          const need = v.needs[k];
          const ok = have >= need;
          return (
            <div key={k} className={`gauge ${ok ? "ok" : ""}`}>
              <CardArt kind={k} size={26} />
              <div className="g-bar" aria-hidden="true">
                {Array.from({ length: need }, (_, i) => <span key={i} className={i < have ? "on" : ""} />)}
              </div>
              <b>{have}/{need}</b>
              <span className="sr">{SUPPLY_LABEL[k]}: {have} of {need}</span>
            </div>
          );
        })}
        {compass && <p className="small brass">The compass is aboard: one less fuel needed.</p>}
      </div>
      <div className="hold" aria-label="Ferry hold">
        {slots.map((s) => (
          <span key={s.key} className={`crate span${s.span} ${s.revealed ? "open" : "shut"} ${s.kind ?? ""} ${s.mine ? "mine" : ""} ${s.fresh ? "fresh" : ""}`} title={s.revealed ? s.kind : s.mine ? `Your ${s.kind}, sealed` : "Sealed crate"}>
            {s.revealed && s.kind ? <CardArt kind={s.kind as CardView["kind"]} size={20} /> : <span className="q">{s.mine ? "•" : "?"}</span>}
          </span>
        ))}
        {Array.from({ length: free }, (_, i) => <span key={`f${i}`} className="crate empty" />)}
      </div>
      <p className="small muted hold-note">Sealed crates open at the end of each tide.</p>
      <button className={`btn ready ${me.ready ? "on" : ""}`} onClick={() => { sfx.click(); act({ type: "ready", ready: !me.ready }); }}>
        <Icon name="anchor" size={18} /> {me.ready ? "You're ready to leave" : "Ready to leave"} <span className="muted">· {ready}/{v.players.length}</span>
      </button>
      <p className="small muted">The ferry sails at the end of a tide once more than half are ready, or after tide {v.totalTides} no matter what.</p>
    </div>
  );
}

function FloodBanner({ v }: { v: GameView }) {
  const last = [...v.log].reverse().find((l) => l.kind === "flood");
  return (
    <div className="overlay flood-banner" aria-live="assertive">
      <div className="wave-anim" aria-hidden="true" />
      <div className="ob-card">
        <span className="eyebrow">Tide {v.tide} of {v.totalTides}</span>
        <h2>{last?.text ?? "The tide rises."}</h2>
      </div>
    </div>
  );
}

function DrawReveal({ v }: { v: GameView }) {
  const d = v.draws[v.you];
  if (!d) return null;
  return (
    <div className="overlay draw-reveal" aria-live="polite">
      <div className="ob-card">
        <span className="eyebrow">{PLACE_INFO[d.place].name}</span>
        <h2>{d.cards.length || d.pearls ? "You found" : "You came back empty-handed"}</h2>
        <div className="found">
          {d.cards.map((k, i) => (
            <span key={i} className="found-card" style={{ animationDelay: `${i * 160}ms` }}>
              <CardArt kind={k} size={60} />
              <b>{CARD_INFO[k].name}</b>
            </span>
          ))}
          {d.pearls > 0 && (
            <span className="found-card" style={{ animationDelay: `${d.cards.length * 160}ms` }}>
              <CardArt kind="pearl" size={60} />
              <b>+{d.pearls} pearls</b>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FlipReveal({ v }: { v: GameView }) {
  const fresh = v.hold.filter((c) => c.tide === v.tide && c.revealed);
  const spoiled = fresh.filter((c) => c.kind === "spoiled").length;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHidden(true), 4200);
    return () => clearTimeout(t);
  }, []);
  if (hidden) return null;
  return (
    <div className="overlay flip-reveal" onClick={() => setHidden(true)}>
      <div className="ob-card">
        <span className="eyebrow">End of tide {v.tide}</span>
        <h2>{fresh.length ? "The crates are opened" : "Nobody loaded anything this tide"}</h2>
        <div className="flips">
          {fresh.map((c, i) => (
            <span key={c.id} className={`flip-card ${c.kind}`} style={{ animationDelay: `${i * 260}ms` }}>
              <span className="flip-inner" style={{ animationDelay: `${i * 260}ms` }}>
                <span className="flip-back" />
                <span className="flip-front"><CardArt kind={c.kind!} size={44} /><b>{CARD_INFO[c.kind!].name}</b></span>
              </span>
            </span>
          ))}
        </div>
        {spoiled > 0 && <p className="alert-text">{spoiled} spoiled crate{spoiled > 1 ? "s" : ""}. Someone is wrecking the voyage.</p>}
        <p className="small muted">Tap to continue</p>
      </div>
    </div>
  );
}

/** Sounds, toasts and the role card at the right moments. */
function usePhaseEffects(v: GameView, showRole: () => void) {
  const prev = useRef<{ phase: string; round: number; offers: Set<string> }>({ phase: "", round: -1, offers: new Set() });
  useEffect(() => {
    const p = prev.current;
    if (p.phase !== v.phase || p.round !== v.round) {
      if (v.phase === "flood") v.tide > 1 ? sfx.flood() : sfx.horn();
      if (v.phase === "reveal") sfx.deal();
      if (v.phase === "trade") sfx.pearl();
      if (v.phase === "flip") {
        sfx.flip();
        if (v.hold.some((c) => c.tide === v.tide && c.kind === "spoiled")) setTimeout(sfx.alert, 900);
      }
      if (v.phase === "flood" && v.tide === 1 && p.round !== v.round) showRole();
    }
    for (const o of v.offers) {
      if (o.to === v.you && o.status === "open" && !p.offers.has(o.id)) {
        const from = v.players.find((x) => x.id === o.from)?.name ?? "Someone";
        toast(`${from} sent you an offer.`, "info");
        sfx.pearl();
      }
    }
    prev.current = { phase: v.phase, round: v.round, offers: new Set(v.offers.map((o) => o.id)) };
  }, [v, showRole]);
}
