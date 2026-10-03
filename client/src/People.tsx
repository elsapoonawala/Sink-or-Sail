import { useState } from "react";
import { type GameView, type PlayerView, ROLE_INFO } from "../../shared/game";
import { SIGNALS } from "../../shared/protocol";
import { Portrait, PearlIcon } from "./art";
import { act, useStore } from "./net";
import { Icon, Sheet } from "./ui";
import { setVolume, toggleBlock, useVoice } from "./voice";

function statusFor(v: GameView, p: PlayerView): string | null {
  if (!p.connected && !p.bot) return "away";
  switch (v.phase) {
    case "search": return p.picked ? "chosen" : null;
    case "trade": return p.done ? "done" : null;
    case "load": return p.done ? "done" : p.loadedThisTide ? `${p.loadedThisTide}/2` : null;
    default: return null;
  }
}

export function PlayerChip({ v, p, onOpen, compact }: { v: GameView; p: PlayerView; onOpen: (id: string) => void; compact?: boolean }) {
  const { voice, signals } = useStore();
  const vu = useVoice();
  const vs = voice[p.id];
  const speaking = !!vu.speaking[p.id];
  const sig = [...signals].reverse().find((s) => s.from === p.id && Date.now() - s.at < 5000);
  const label = sig ? SIGNALS.find((x) => x.key === sig.key)?.label : null;
  const status = statusFor(v, p);
  const isYou = p.id === v.you;
  return (
    <button
      className={`chip ${speaking ? "speaking" : ""} ${!p.connected && !p.bot ? "away" : ""} ${compact ? "compact" : ""}`}
      onClick={() => onOpen(p.id)}
      aria-label={`${p.name}${isYou ? " (you)" : ""}${p.role ? `, ${ROLE_INFO[p.role].name}` : ""}`}
    >
      <span className="chip-face">
        <Portrait role={p.role} seat={p.seat} size={compact ? 44 : 52} />
        {vs?.on && vs.muted && <span className="chip-badge muted" title="Muted"><Icon name="micOff" size={11} /></span>}
        {vs?.on && !vs.muted && <span className="chip-badge live" title="In voice"><Icon name="mic" size={11} /></span>}
        {p.ready && v.phase !== "lobby" && <span className="chip-badge ready" title="Ready to leave"><Icon name="anchor" size={11} /></span>}
        {v.phase === "lobby" && v.hostId === p.id && <span className="chip-badge host" title="Host"><Icon name="crown" size={11} /></span>}
        {label && <span className="bubble" key={sig!.at}>{label}</span>}
      </span>
      <span className="chip-name">{isYou ? "You" : p.name}</span>
      {p.bot && !status && <span className="chip-status bot">bot</span>}
      {!compact && v.phase !== "lobby" && (
        <span className="chip-meta"><PearlIcon size={11} /> {p.pearls} · {p.handCount} cards</span>
      )}
      {status && <span className={`chip-status ${status}`}>{status}</span>}
      {p.wrecker && v.phase !== "lobby" && <span className="chip-wrecker">Wrecker</span>}
    </button>
  );
}

export function PlayerSheet({ v, pid, onClose, onOffer }: { v: GameView; pid: string; onClose: () => void; onOffer?: (pid: string) => void }) {
  const p = v.players.find((x) => x.id === pid);
  const { voice } = useStore();
  const vu = useVoice();
  const [, force] = useState(0);
  if (!p) return null;
  const isYou = p.id === v.you;
  const inVoice = voice[p.id]?.on;
  const vol = vu.volume[p.id] ?? 1;
  return (
    <Sheet title={isYou ? "You" : p.name} onClose={onClose}>
      <div className="player-sheet">
        <Portrait role={p.role} seat={p.seat} size={96} />
        <div className="ps-info">
          {p.role ? (
            <>
              <h4>{ROLE_INFO[p.role].name}</h4>
              <p className="muted small">{ROLE_INFO[p.role].wear}</p>
              <p><b className="tag">{ROLE_INFO[p.role].short}</b> {ROLE_INFO[p.role].power}</p>
            </>
          ) : (
            <p className="muted">Roles are dealt when the game starts.</p>
          )}
          {isYou && p.wrecker !== undefined && v.phase !== "lobby" && <Allegiance wrecker={!!p.wrecker} count={v.wreckerCount} />}
        </div>
      </div>
      {!isYou && inVoice && vu.joined && (
        <div className="vol-row">
          <label htmlFor={`vol-${p.id}`}>Volume for {p.name}</label>
          <input id={`vol-${p.id}`} type="range" min={0} max={2} step={0.05} value={vol} onChange={(e) => { setVolume(p.id, Number(e.target.value)); force((n) => n + 1); }} />
          <button className={`btn small ${vu.blocked[p.id] ? "danger" : "ghost"}`} onClick={() => toggleBlock(p.id)}>
            {vu.blocked[p.id] ? `Unmute ${p.name}` : `Mute ${p.name} for me`}
          </button>
        </div>
      )}
      {!isYou && !inVoice && <p className="muted small">{p.name} isn't in voice chat. Signals and chat still reach them.</p>}
      <div className="row gap wrap">
        {!isYou && v.phase === "trade" && onOffer && (
          <button className="btn primary" onClick={() => { onOffer(p.id); onClose(); }}>Make {p.name} an offer</button>
        )}
        {!isYou && v.phase === "lobby" && v.hostId === v.you && (
          <button className="btn ghost danger" onClick={() => { act({ type: "kick", target: p.id }); onClose(); }}>Remove from room</button>
        )}
      </div>
    </Sheet>
  );
}

export function Allegiance({ wrecker, count }: { wrecker: boolean; count: number }) {
  return wrecker ? (
    <div className="allegiance wrecker">
      <b>You are the Wrecker.</b> You win if the ferry sails short of supplies. Your spoiled crates look like normal supplies to everyone else, and when you trade, you hand them over first.
      {count > 1 && " Your fellow Wrecker is marked on their portrait."}
    </div>
  ) : (
    <div className="allegiance islander">
      <b>You are an Islander.</b> Get the ferry loaded and sail together.{" "}
      {count ? `Careful: ${count === 1 ? "one player is a secret Wrecker" : "two players are secret Wreckers"}.` : "Everyone is on your side this game."}
    </div>
  );
}
