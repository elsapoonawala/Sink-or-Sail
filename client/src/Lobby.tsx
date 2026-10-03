import { useState } from "react";
import { type GameView, MAX_PLAYERS } from "../../shared/game";
import { Portrait } from "./art";
import { CommsPanel } from "./Comms";
import { HowTo } from "./HowTo";
import { act, leaveRoom, toast } from "./net";
import { PlayerSheet } from "./People";
import { copyText, Icon } from "./ui";

export function Lobby({ v }: { v: GameView }) {
  const host = v.hostId === v.you;
  const [open, setOpen] = useState<string | null>(null);
  const link = `${location.origin}/r/${v.code}`;
  const n = v.players.length;
  const wreckerText = v.settings.wrecker === "off" ? "Off" : v.settings.wrecker === "on" ? "On" : "Auto";
  const willHaveWrecker = v.wreckerCount > 0;
  const hostName = v.players.find((p) => p.id === v.hostId)?.name ?? "the host";

  return (
    <main className="lobby">
      <section className="lobby-main">
        <div className="code-card">
          <span className="eyebrow">Room code</span>
          <div className="big-code" aria-label={`Room code ${v.code.split("").join(" ")}`}>{v.code}</div>
          <p className="small">Friends open this site and enter the code, or use the link.</p>
          <div className="row gap wrap center">
            <code className="link">{link.replace(/^https?:\/\//, "")}</code>
            <button className="btn ghost small" onClick={async () => toast((await copyText(link)) ? "Link copied." : "Copy didn't work. Select the link and copy it.")}>
              <Icon name="copy" size={16} /> Copy link
            </button>
          </div>
        </div>

        <div className="crew">
          <h2>On the pier <span className="muted">{n} of {MAX_PLAYERS}</span></h2>
          <ul className="crew-list">
            {v.players.map((p) => (
              <li key={p.id}>
                <button className={`crew-item ${!p.connected && !p.bot ? "away" : ""}`} onClick={() => setOpen(p.id)}>
                  <Portrait role={null} seat={p.seat} size={54} />
                  <span>{p.id === v.you ? `${p.name} (you)` : p.name}</span>
                  {p.id === v.hostId && <small className="tag">host</small>}
                  {p.bot && <small className="tag">bot</small>}
                  {!p.connected && !p.bot && <small className="tag">away</small>}
                </button>
              </li>
            ))}
            {host && n < MAX_PLAYERS && (
              <li>
                <button className="crew-item add" onClick={() => act({ type: "addBot" })}>
                  <span className="add-circle"><Icon name="bot" /></span>
                  <span>Add a practice bot</span>
                </button>
              </li>
            )}
          </ul>
        </div>

        <div className="settings">
          <div className="setting">
            <div>
              <b>Game length</b>
              <p className="small muted">{v.settings.quick ? "Quick: 3 tides, about 12 minutes" : "Full: 5 tides, about 20 minutes"}</p>
            </div>
            <div className="seg" role="group" aria-label="Game length">
              <button className={!v.settings.quick ? "on" : ""} onClick={() => host && act({ type: "settings", quick: false })} disabled={!host}>Full</button>
              <button className={v.settings.quick ? "on" : ""} onClick={() => host && act({ type: "settings", quick: true })} disabled={!host}>Quick</button>
            </div>
          </div>
          <div className="setting">
            <div>
              <b>Secret Wrecker</b>
              <p className="small muted">
                {willHaveWrecker ? `On: ${v.wreckerCount === 2 ? "two players are" : "one player is"} secretly trying to sink the voyage.` : wreckerText === "Auto" ? "Joins automatically with 5 or more players." : "Off: everyone is on the same side."}
              </p>
            </div>
            <div className="seg" role="group" aria-label="Secret Wrecker">
              {(["auto", "on", "off"] as const).map((w) => (
                <button key={w} className={v.settings.wrecker === w ? "on" : ""} onClick={() => host && act({ type: "settings", wrecker: w })} disabled={!host}>
                  {w[0].toUpperCase() + w.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lobby-cta">
          {host ? (
            <button className="btn primary big" onClick={() => act({ type: "start" })} disabled={n < 2}>
              {n < 2 ? "Waiting for at least 2 players" : `Cast off with ${n} players`}
            </button>
          ) : (
            <p className="waiting">Waiting for {hostName} to start the game…</p>
          )}
          {host && n < 2 && <p className="small muted">Playing alone? Add a practice bot.</p>}
          <button className="btn ghost small" onClick={leaveRoom}>Leave room</button>
        </div>
      </section>

      <aside className="lobby-side">
        <HowTo auto />
        <CommsPanel v={v} />
      </aside>

      {open && <PlayerSheet v={v} pid={open} onClose={() => setOpen(null)} />}
    </main>
  );
}
