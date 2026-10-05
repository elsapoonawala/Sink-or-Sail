import { useState } from "react";
import { type GameView, type PlayerView, KIND_INFO, ROLE_INFO } from "../../shared/game";
import { PearlIcon, Portrait } from "./art";
import { act, useStore } from "./net";
import { Icon, Sheet } from "./ui";
import { setVolume, toggleBlock, useVoice } from "./voice";

export function PeopleSheet({ v, onClose, onOpen }: { v: GameView; onClose: () => void; onOpen: (pid: string) => void }) {
  const { voice } = useStore();
  const vu = useVoice();
  return (
    <Sheet title="Everyone on the island" onClose={onClose}>
      <ul className="people">
        {v.players.map((p) => {
          const vs = voice[p.id];
          return (
            <li key={p.id}>
              <button className={`person ${vu.speaking[p.id] ? "speaking" : ""}`} onClick={() => onOpen(p.id)}>
                <Portrait role={p.role} seat={p.seat} size={44} />
                <span className="person-name">
                  <b>{p.id === v.you ? `${p.name} (you)` : p.name}</b>
                  <small className="muted">{p.role ? ROLE_INFO[p.role].name : "Choosing a character"}{p.bot ? " · bot" : ""}{!p.connected && !p.bot ? " · away" : ""}</small>
                </span>
                <span className="person-tags">
                  {p.brig && <small className="tag">brig</small>}
                  {p.ready && <small className="tag ok">ready</small>}
                  {vs?.on && <Icon name={vs.muted ? "micOff" : "mic"} size={16} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

export function PlayerSheet({ v, pid, onClose }: { v: GameView; pid: string; onClose: () => void }) {
  const p = v.players.find((x) => x.id === pid);
  const { voice } = useStore();
  const vu = useVoice();
  const [, force] = useState(0);
  if (!p) return null;
  const isYou = p.id === v.you;
  const me = v.players.find((x) => x.id === v.you)!;
  const inVoice = voice[p.id]?.on;
  const vol = vu.volume[p.id] ?? 1;
  const canAccuse = !isYou && v.phase === "play" && v.wreckerCount > 0 && !me.accused && !me.brig && !p.brig && v.vote?.outcome !== "open";
  return (
    <Sheet title={isYou ? "You" : p.name} onClose={onClose}>
      <div className="player-sheet">
        <Portrait role={p.role ?? p.choice} seat={p.seat} size={96} />
        <div className="ps-info">
          {p.role || p.choice ? (
            <>
              <h4>{ROLE_INFO[(p.role ?? p.choice)!].name}</h4>
              <p className="muted small">{ROLE_INFO[(p.role ?? p.choice)!].wear}</p>
              <p><b className="tag">{ROLE_INFO[(p.role ?? p.choice)!].short}</b> {ROLE_INFO[(p.role ?? p.choice)!].power}</p>
            </>
          ) : (
            <p className="muted">No character chosen yet. One is dealt when the game starts.</p>
          )}
          {v.phase !== "lobby" && (
            <p className="small">
              <PearlIcon size={13} /> {p.pearls} pearls · carrying {p.carry.length ? p.carry.map((c) => KIND_INFO[c.kind].name.toLowerCase()).join(", ") : "nothing"}
            </p>
          )}
          {isYou && v.phase !== "lobby" && <Allegiance wrecker={!!p.wrecker} count={v.wreckerCount} />}
          {!isYou && p.wrecker && v.phase === "play" && <p className="allegiance wrecker small">{p.brig ? "Caught: this player is a Wrecker." : "This player is a fellow Wrecker."}</p>}
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
      {!isYou && !inVoice && !p.bot && <p className="muted small">{p.name} isn't on the walkie-talkie. Signals and chat still reach them.</p>}
      <div className="row gap wrap">
        {canAccuse && (
          <button className="btn ghost danger" onClick={() => { act({ type: "accuse", target: p.id }); onClose(); }}>
            Accuse {p.name} of wrecking
          </button>
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
      <b>You are the Wrecker.</b> You win if the Kohinoor sails short of supplies. Stand at the gangway to sink a crate when no one is watching, and don't get voted into the brig.
      {count > 1 && " Your fellow Wrecker is marked for you."}
    </div>
  ) : (
    <div className="allegiance islander">
      <b>You are an Islander.</b> Load the Kohinoor and be on the pier when it sails.{" "}
      {count ? `Careful: ${count === 1 ? "one player is a secret Wrecker" : "two players are secret Wreckers"} who will sink crates at the gangway.` : "Everyone is on your side this game."}
    </div>
  );
}

export type { PlayerView };
