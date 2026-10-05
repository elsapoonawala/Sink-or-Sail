// The in-game screen: the living island with a brass-and-velvet HUD over it.
import { useEffect, useRef, useState } from "react";
import {
  type GameView, DUMP_COOLDOWN, MONSTER_R, KIND_INFO, ROLE_INFO, STRIKE_R,
  carryLimit, nearDive, nearDoor, nearGangway, nearLamp, nearStables, nextWaveAt,
} from "../../shared/game";
import { type BuildingId, GANGWAY, ZONES, ZONE_IDS, buildingAt, floodsAtTide, onDock, seaLevel, swimming } from "../../shared/world";
import { CardArt, PearlIcon, Portrait } from "./art";
import { ChatPanel, SignalBar } from "./Comms";
import { Rules } from "./HowTo";
import { act, leaveRoom, live, setChatOpen, toast, useStore } from "./net";
import { Allegiance, PeopleSheet, PlayerSheet } from "./People";
import { setSound, soundOn, startSea } from "./sound";
import { Icon, Sheet, copyText } from "./ui";
import { pttDown, pttUp, toggleMute, useVoice, voiceSupported } from "./voice";
import { MiniMap, World, type WorldApi } from "./World";

type Panel = null | "chat" | "people" | "menu" | "you" | "map" | "help";

/** The nearest player you could attack, and how far away they are. */
/** What each building holds, for the Enter button. */
const INSIDE: Record<BuildingId, string> = {
  hospital: "Medicine on the beds",
  palace: "The compass and a diamond",
  hotel: "Tools in the cellar, a diamond in the safe",
  lighthouse: "Fuel drums and the lamp",
  stables: "Tools and saddles",
  shipwreck: "Fuel and a diamond in the hold",
  market: "A supply crate",
};

function attackTarget(v: GameView, pos: { x: number; y: number }, now: number) {
  const here = buildingAt(pos.x, pos.y);
  return v.players
    .filter((p) => p.id !== v.you && !p.brig && now >= p.downUntil && now >= p.guardUntil)
    .filter((p) => {
      const l = live.pos.get(p.id) ?? p;
      return buildingAt(l.x, l.y) === here;
    })
    .map((p) => {
      const l = live.pos.get(p.id) ?? p;
      return { p, d: Math.hypot(l.x - pos.x, l.y - pos.y) };
    })
    .sort((a, b) => a.d - b.d)[0];
}

function useNow(ms: number) {
  const { clockOffset } = useStore();
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return Date.now() + clockOffset;
}

function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Game({ v }: { v: GameView }) {
  const api = useRef<WorldApi | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [intro, setIntro] = useState(true);
  const now = useNow(250);
  const seenAt = useRef(new Map<number, number>());
  const seen = (n: number) => {
    if (!seenAt.current.has(n)) seenAt.current.set(n, now);
    return seenAt.current.get(n)!;
  };
  const { unread } = useStore();
  const me = v.players.find((p) => p.id === v.you)!;
  const pos = api.current?.me() ?? live.pos.get(v.you) ?? me;

  useEffect(() => {
    setChatOpen(panel === "chat");
  }, [panel]);
  useEffect(() => {
    startSea();
  }, []);
  // Say plainly when your crates go into the hold.
  const myHold = v.hold.filter((c) => c.owner === v.you);
  const loadedRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = loadedRef.current;
    loadedRef.current = myHold.length;
    if (prev === null || myHold.length <= prev) return;
    const added = myHold.slice(prev).map((c) => c.kind);
    toast(v.loaded >= v.goal ? `Loaded ${added.join(", ")}. The Kohinoor has ${v.loaded} crates: enough to sail!` : `Loaded ${added.join(", ")}. The Kohinoor has ${v.loaded} of ${v.goal} crates.`);
  }, [myHold.length]);
  // The intro card shows your character, then gets out of the way.
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), window.matchMedia("(max-width: 720px)").matches ? 6000 : 14000);
    return () => clearTimeout(t);
  }, [v.round]);

  const tideLeft = v.tideStartedAt + v.tideMs - now;
  const lastTide = v.tide >= v.totalTides;
  const waveAt = nextWaveAt(v, now);
  const nextFloods = ZONE_IDS.filter((z) => floodsAtTide(z, v.totalTides) === v.tide + 1).map((z) => ZONES[z].name);
  const sailing = v.phase === "sailing";

  // What can I do right here?
  const actions: { key: string; label: string; sub?: string; onClick: () => void; tone?: "primary" | "danger" | "ghost" }[] = [];
  const busy = now < me.busyUntil;
  const down = now < me.downUntil;
  if (v.phase === "play" && !me.brig && !busy) {
    if (me.carry.some((c) => c.kind === "cutlass")) {
      // The Attack button stays up while you hold a cutlass; it strikes whoever is in reach.
      const t = attackTarget(v, pos, now);
      if (t && t.d < STRIKE_R) {
        const victim = t.p;
        actions.push({ key: "strike", label: `⚔ Attack ${victim.name}`, sub: victim.carry.length ? `They drop ${victim.carry.length} crate${victim.carry.length > 1 ? "s" : ""}` : "Knocks them out for 15s", onClick: () => act({ type: "strike", target: victim.id }), tone: "danger" });
      } else {
        actions.push({ key: "strike", label: "⚔ Attack", sub: t ? `Get closer to ${t.p.name} (follow the red arrow)` : "Nobody to attack right now", onClick: () => toast(t ? `Walk right up to ${t.p.name} first. Follow the red arrow.` : "There's nobody you can attack right now."), tone: "danger" });
      }
    }
    // Buildings: Enter at the door, Go outside from anywhere inside.
    const room = buildingAt(pos.x, pos.y);
    const door = room ? null : nearDoor(pos);
    if (room) actions.push({ key: "leave", label: "Go outside", sub: `Leave ${room.name}`, onClick: () => act({ type: "leave" }), tone: "ghost" });
    else if (door && !v.closed.includes(door.id)) actions.push({ key: "enter", label: `Enter ${door.name}`, sub: INSIDE[door.id], onClick: () => act({ type: "enter" }), tone: "primary" });
    const dive = nearDive(pos);
    if (dive >= 0) {
      const wait = v.diveReady[dive] - now;
      actions.push({ key: "dive", label: wait > 0 ? `Oysters regrow in ${Math.ceil(wait / 1000)}s` : "Dive for pearls", sub: me.role === "diver" ? "+4 pearls" : "+2 pearls", onClick: () => act({ type: "dive" }), tone: wait > 0 ? "ghost" : "primary" });
    }
    if (nearLamp(pos)) actions.push({ key: "lamp", label: v.lampTide === v.tide ? "Lamp already lit this tide" : "Light the lamp", sub: "Reveals every crate", onClick: () => act({ type: "lamp" }), tone: v.lampTide === v.tide ? "ghost" : "primary" });
    if (!me.mounted && nearStables(pos)) actions.push({ key: "mount", label: "Saddle a horse", sub: "Ride much faster", onClick: () => act({ type: "mount" }), tone: "primary" });
    if (me.wrecker && nearGangway(pos)) {
      const wait = DUMP_COOLDOWN - (now - (me.lastDump ?? -DUMP_COOLDOWN));
      actions.push({ key: "dump", label: wait > 0 ? `Lie low ${Math.ceil(wait / 1000)}s` : "Sink a crate", sub: "Secret Wrecker move", onClick: () => act({ type: "dump" }), tone: wait > 0 ? "ghost" : "danger" });
    }
    // Loading is automatic on the gangway; this button walks you there so it's never a mystery.
    const cargo = me.carry.filter((c) => c.kind !== "cutlass");
    const toGangway = Math.hypot(pos.x - GANGWAY.x, pos.y - GANGWAY.y);
    if (cargo.length && !nearGangway(pos) && toGangway < 700) {
      actions.push({ key: "load", label: `Load ${cargo.length} crate${cargo.length > 1 ? "s" : ""} onto the Kohinoor`, sub: "Walks you onto the gold gangway", onClick: () => api.current?.walkTo(GANGWAY.x, GANGWAY.y), tone: "primary" });
    }
    if (onDock(pos.x, pos.y)) actions.push({ key: "ready", label: me.ready ? "Not ready yet" : "Ready to sail", sub: me.ready ? "Tap to wait longer" : "Sails when most are ready", onClick: () => act({ type: "ready", ready: !me.ready }), tone: me.ready ? "ghost" : "primary" });
  }

  const mine = v.crates.some((c) => c.owner === v.you);
  const swimmingNow = !me.mounted && swimming(pos.x, pos.y, { level: seaLevel(v.tide, v.tideStartedAt, v.totalTides, now), secretFound: v.secretFound, caveOpen: v.caveOpen });
  const full = me.carry.length >= carryLimit(me);
  const left = Math.max(0, v.goal - v.loaded);
  const onlyBlade = me.carry.length > 0 && nearGangway(pos) && me.carry.every((c) => c.kind === "cutlass");
  let hint = "";
  if (me.brig) hint = "You're locked in the Kohinoor's brig. You'll sail, but you can't help or hinder.";
  else if (down) hint = `Knocked out! You're back on your feet in ${Math.ceil((me.downUntil - now) / 1000)}s.`;
  else if (busy) hint = "Diving…";
  else if (buildingAt(pos.x, pos.y) && me.carry.length >= carryLimit(me)) hint = "Hands full. Tap Go outside and take it to the Kohinoor.";
  else if (buildingAt(pos.x, pos.y)) hint = `You're inside ${buildingAt(pos.x, pos.y)!.name}. Walk into anything glowing to take it, then tap Go outside.`;
  else if (v.monster && now < v.monster.grabAt && Math.hypot(pos.x - v.monster.x, pos.y - v.monster.y) < MONSTER_R + 80) hint = me.carry.some((c) => c.kind !== "cutlass") ? "Bubbles! A sea monster is coming up. Get out of the red ring or it grabs your crates!" : "Bubbles! A sea monster is coming up. Stay out of the red ring.";
  else if (swimmingNow) hint = "You're swimming. It's slow going: head for dry land.";
  else if (v.sailAt) hint = `The Kohinoor sails in ${Math.ceil((v.sailAt - now) / 1000)}s. Get on the pier!`;
  else if (lastTide && tideLeft < 60_000) hint = "Last call! Be on the pier when the time runs out.";
  else if (onlyBlade) hint = "You keep the cutlass. Walk up to someone and strike to make them drop their cargo.";
  else if (full) hint = "Hands full. Follow the gold arrow to the Kohinoor and step onto the LOAD HERE circle.";
  else if (me.carry.length && me.carry.some((c) => c.kind !== "cutlass")) hint = "To load, step onto the gold LOAD HERE circle by the Kohinoor. Your crates go in by themselves.";
  else if (left) hint = `Find glowing crates${mine ? " (the gold one marked Yours is saved for you)" : ""}. The Kohinoor needs ${left} more or she sinks.`;
  else hint = "The Kohinoor has enough crates! Extra ones pay you pearls. Be on the pier when she sails.";

  const lampOn = now < v.lampUntil;
  // Phones show only urgent news; everything else lives in the hint line.
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
  const myItems = me.carry;

  return (
    <main className={`play ${sailing ? "sailing" : ""}`}>
      <World v={v} api={api} onTapPlayer={(pid) => setSheetFor(pid)} />

      {/* top left: the tide */}
      <section className="hud-tide" aria-label="Tide">
        <div className="tide-row">
          <span className="eyebrow">Tide {v.tide} of {v.totalTides}</span>
          <b className={`tide-clock ${tideLeft < 20_000 ? "low" : ""}`}>{sailing ? "Sailing" : mmss(tideLeft)}</b>
        </div>
        <div className="tide-track" aria-hidden="true">
          {Array.from({ length: v.totalTides }, (_, i) => (
            <span key={i} className={i + 1 < v.tide ? "past" : i + 1 === v.tide ? "now" : ""}>
              {i + 1 === v.tide && <i style={{ width: `${Math.min(100, 100 * (1 - tideLeft / v.tideMs))}%` }} />}
            </span>
          ))}
        </div>
        <p className="tide-next small">
          {sailing ? "The Kohinoor is leaving." : lastTide ? "When this runs out, the Kohinoor leaves." : nextFloods.length ? `Next tide floods ${nextFloods.join(" & ")}` : "The water keeps rising."}
        </p>
        {!sailing && waveAt && <p className="tide-next small wave">Next crates wash up in {mmss(waveAt - now)}</p>}
        {lampOn && <p className="tide-next small lamp">Lighthouse lit: every crate shows on the map.</p>}
      </section>

      {/* top centre: the Kohinoor's hold */}
      <section className="hud-hold" aria-label="The Kohinoor's hold">
        <div className={`goal-bar ${v.loaded >= v.goal ? "ok" : ""}`} title={`${v.loaded} of ${v.goal} crates aboard`}>
          <span className="goal-label">{v.loaded >= v.goal ? "Ready to sail" : "Load or sink"}</span>
          <span className="goal-track"><span style={{ width: `${Math.min(100, (v.loaded / v.goal) * 100)}%` }} /></span>
          <b>{v.loaded}/{v.goal}</b>
        </div>
      </section>

      {/* top right: map and menu */}
      <section className="hud-map">
        <button className="map-btn" onClick={() => setPanel("map")} aria-label="Open the big map">
          <MiniMap v={v} size={150} />
        </button>
        <div className="hud-icons">
          <button className="icon-btn" onClick={() => api.current?.zoomBy(1 / 1.4)} aria-label="Zoom out" title="Zoom out (or scroll / pinch)"><b className="zoom-glyph">−</b></button>
          <button className="icon-btn" onClick={() => api.current?.zoomBy(1.4)} aria-label="Zoom in" title="Zoom in"><b className="zoom-glyph">+</b></button>
          <button className="icon-btn" onClick={() => setPanel("help")} aria-label="How to play"><Icon name="help" /></button>
          <button className="icon-btn" onClick={() => setPanel("menu")} aria-label="Menu"><Icon name="anchor" /></button>
        </div>
      </section>

      {/* feed: recent news, fading out after a few seconds */}
      <ol className="hud-feed" aria-live="polite">
        {v.log.slice(-3).filter((l) => now - seen(l.n) < (phone ? 4500 : 9000) && (!phone || l.kind === "flood" || l.kind === "alert")).map((l) => <li key={l.n} className={`log-${l.kind}`}>{l.text}</li>)}
      </ol>

      {/* banners */}
      {v.sailAt && <div className="banner sail">The Kohinoor sails in {Math.ceil((v.sailAt - now) / 1000)}s</div>}
      {v.vote?.outcome === "open" && <VoteCard v={v} now={now} />}
      {v.phase === "play" && v.tide === 1 && !me.brig && !intro && <FirstSteps v={v} />}
      {intro && me.role && (
        <div className="intro-card" onClick={() => setIntro(false)}>
          <Portrait role={me.role} seat={me.seat} size={64} />
          <div>
            <span className="eyebrow">You are</span>
            <h3>{ROLE_INFO[me.role].name}</h3>
            <p className="small">{ROLE_INFO[me.role].power}</p>
            {me.wrecker && <p className="small wreck-note">…and secretly the <b>Wrecker</b>. Sink crates at the gangway without being caught.</p>}
            <p className="small muted">Walk with WASD, arrows, a click, or drag on your phone. Scroll or pinch to zoom out. Grab glowing crates and carry them to the Kohinoor.</p>
          </div>
        </div>
      )}

      {/* bottom left: walkie-talkie and comms */}
      <section className="hud-comms">
        <Walkie />
        <button className="icon-btn big" onClick={() => setPanel("chat")} aria-label="Chat and signals">
          <Icon name="chat" />
          {unread > 0 && <span className="badge">{unread}</span>}
        </button>
        <button className="icon-btn big" onClick={() => setPanel("people")} aria-label="Everyone">
          <Portrait role={me.role} seat={me.seat} size={30} />
        </button>
      </section>

      {/* bottom centre: what you carry */}
      <section className="hud-carry">
        <p className="hint">{hint}</p>
        <div className="carry-row">
          {Array.from({ length: carryLimit(me) }, (_, i) => {
            const it = myItems[i];
            return it ? (
              <button key={it.id} className="slot filled" onClick={() => act({ type: "drop", itemId: it.id })} title={`Drop ${KIND_INFO[it.kind].name}`} aria-label={`Carrying ${KIND_INFO[it.kind].name}. Tap to drop.`}>
                <CardArt kind={it.kind} size={28} />
              </button>
            ) : (
              <span key={i} className="slot" aria-hidden="true" />
            );
          })}
          <span className="pearls" title="Your pearls"><PearlIcon size={18} /> {me.pearls}</span>
        </div>
      </section>

      {/* bottom right: actions */}
      <section className="hud-actions">
        {actions.slice(0, 3).map((a) => (
          <button key={a.key} className={`act-btn ${a.tone ?? "primary"}`} onClick={a.onClick}>
            <b>{a.label}</b>
            {a.sub && <small>{a.sub}</small>}
          </button>
        ))}
      </section>

      {/* sheets */}
      {panel === "chat" && (
        <Sheet title="Signals and chat" onClose={() => setPanel(null)}>
          <SignalBar />
          <ChatPanel v={v} />
        </Sheet>
      )}
      {panel === "people" && <PeopleSheet v={v} onClose={() => setPanel(null)} onOpen={(pid) => { setPanel(null); setSheetFor(pid); }} />}
      {panel === "help" && (
        <Sheet title="Rules" onClose={() => setPanel(null)} wide>
          <Allegiance wrecker={!!me.wrecker} count={v.wreckerCount} />
          <Rules />
        </Sheet>
      )}
      {panel === "map" && (
        <Sheet title="The island" onClose={() => setPanel(null)} wide>
          <div className="big-map"><MiniMap v={v} size={Math.min(640, window.innerWidth - 60)} /></div>
          <p className="small muted">Crates and pearls you've seen show as dots: gold for fuel and tools, pink for medicine, blue diamonds, red cutlasses. Zoom out on the island (scroll, pinch or −) to spot more at once.</p>
          <ul className="legend small">
            {ZONE_IDS.map((z) => {
              const n = floodsAtTide(z, v.totalTides);
              return <li key={z}><b>{ZONES[z].name}</b> <span className="muted">{ZONES[z].blurb}{n ? ` Floods at tide ${n}.` : ""}</span></li>;
            })}
          </ul>
        </Sheet>
      )}
      {panel === "menu" && <MenuSheet v={v} onClose={() => setPanel(null)} />}
      {sheetFor && <PlayerSheet v={v} pid={sheetFor} onClose={() => setSheetFor(null)} />}
    </main>
  );
}

/** A first-tide checklist that ticks itself off as you play. */
function FirstSteps({ v }: { v: GameView }) {
  const me = v.players.find((p) => p.id === v.you)!;
  const [done, setDone] = useState({ pick: false, load: false });
  const [hidden, setHidden] = useState(false);
  const pick = done.pick || me.carry.some((c) => c.kind !== "cutlass") || v.hold.some((c) => c.owner === v.you);
  const load = done.load || v.hold.some((c) => c.owner === v.you);
  useEffect(() => {
    if (pick !== done.pick || load !== done.load) setDone({ pick, load });
  }, [pick, load, done]);
  if (hidden || (pick && load)) return null;
  const steps = [
    { ok: pick, text: "Walk into a glowing crate to pick it up" },
    { ok: load, text: "Step onto the gold LOAD HERE circle by the Kohinoor" },
    { ok: false, text: "Be on the pier when she sails" },
  ];
  return (
    <div className="first-steps" onClick={() => setHidden(true)} title="Tap to hide">
      <span className="eyebrow">First steps</span>
      <ol>
        {steps.map((st) => <li key={st.text} className={st.ok ? "ok" : ""}>{st.ok ? "✓" : "○"} {st.text}</li>)}
      </ol>
    </div>
  );
}

/** Hold to talk, like a walkie-talkie. The small button beside it mutes or opens your mic. */
function Walkie() {
  const vu = useVoice();
  const { voice } = useStore();
  const anyoneTalking = Object.values(vu.speaking).some(Boolean);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if ((e.key === "v" || e.key === "V") && !e.repeat) pttDown();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "v" || e.key === "V") pttUp();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  if (!voiceSupported) return null;
  const live = vu.joined && !vu.muted;
  const others = Object.values(voice).filter((x) => x.on).length - (vu.joined ? 1 : 0);
  return (
    <div className="walkie-wrap">
      <button
        className={`walkie ${live ? "live" : ""} ${anyoneTalking ? "rx" : ""}`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pttDown(); }}
        onPointerUp={pttUp}
        onPointerCancel={pttUp}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={vu.joined ? "Hold to talk on the walkie-talkie (or hold V)" : "Turn on the walkie-talkie"}
        title={vu.joined ? "Hold to talk (or hold V)" : "Turn on the walkie-talkie"}
      >
        <WalkieIcon />
        <small>{!vu.joined ? (vu.joining ? "Tuning…" : "Walkie") : live ? "On air" : "Hold to talk"}</small>
      </button>
      {vu.joined && (
        <button className={`walkie-mute ${vu.muted ? "muted" : "open"}`} onClick={() => toggleMute()} aria-label={vu.muted ? "Open mic (talk hands-free)" : "Mute your mic"} title={vu.muted ? "Open mic" : "Mute"}>
          <Icon name={vu.muted ? "micOff" : "mic"} size={18} />
        </button>
      )}
      {vu.joined && <span className="walkie-count small">{others > 0 ? `${others} on channel` : "Channel quiet"}</span>}
    </div>
  );
}

function WalkieIcon() {
  return (
    <svg viewBox="0 0 32 44" width="26" height="36" aria-hidden="true">
      <rect x="20" y="1" width="3" height="12" rx="1.5" fill="#1d1410" />
      <rect x="5" y="10" width="22" height="32" rx="5" fill="#1d2b33" stroke="#d2a74e" strokeWidth="1.5" />
      <rect x="9" y="14" width="14" height="8" rx="2" fill="#7fe0d2" opacity=".85" />
      {[0, 1, 2].map((r) => <rect key={r} x="10" y={26 + r * 4} width="12" height="1.6" rx=".8" fill="#d2a74e" opacity=".8" />)}
      <circle cx="12" cy="38.5" r="1.4" fill="#b8434f" />
    </svg>
  );
}

function VoteCard({ v, now }: { v: GameView; now: number }) {
  const vote = v.vote!;
  const name = (id: string) => (id === v.you ? "you" : v.players.find((p) => p.id === id)?.name ?? "someone");
  const me = v.players.find((p) => p.id === v.you)!;
  const voted = vote.yes.includes(v.you) || vote.no.includes(v.you);
  const isTarget = vote.target === v.you;
  return (
    <div className="vote-card">
      <p><b>{name(vote.by)}</b> accuses <b>{name(vote.target)}</b> of wrecking. Lock them in the brig?</p>
      <p className="small muted">{vote.yes.length} yes · {vote.no.length} no · {Math.ceil((vote.endsAt - now) / 1000)}s</p>
      {!isTarget && !me.brig && (
        <div className="row gap">
          <button className={`btn small ${vote.yes.includes(v.you) ? "primary" : "ghost"}`} onClick={() => act({ type: "vote", yes: true })}>Brig them</button>
          <button className={`btn small ${vote.no.includes(v.you) ? "primary" : "ghost"}`} onClick={() => act({ type: "vote", yes: false })}>Let them be</button>
        </div>
      )}
      {isTarget && <p className="small">Plead your case on the walkie-talkie!</p>}
      {voted && !isTarget && <p className="small muted">You can change your vote until it closes.</p>}
    </div>
  );
}

function MenuSheet({ v, onClose }: { v: GameView; onClose: () => void }) {
  const [sound, setS] = useState(soundOn());
  const link = `${location.origin}/r/${v.code}`;
  return (
    <Sheet title={`Room ${v.code}`} onClose={onClose}>
      <div className="menu-list">
        <button className="btn ghost" onClick={async () => toast((await copyText(link)) ? "Link copied." : "Copy didn't work.")}><Icon name="copy" size={16} /> Copy room link</button>
        <button className="btn ghost" onClick={() => { setSound(!sound); setS(!sound); }}><Icon name={sound ? "sound" : "soundOff"} size={16} /> Sound {sound ? "on" : "off"}</button>
        {v.hostId === v.you && <button className="btn ghost" onClick={() => { act({ type: "lobby" }); onClose(); }} disabled={v.phase === "play"}>Back to lobby</button>}
        <button className="btn ghost danger" onClick={leaveRoom}>Leave the game</button>
        <p className="small muted">Keys: WASD or arrows to walk, scroll to zoom, hold V to talk. On a phone, drag anywhere to steer, tap where to go, and pinch to zoom.</p>
      </div>
    </Sheet>
  );
}

