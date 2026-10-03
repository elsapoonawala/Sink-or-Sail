import { useState } from "react";
import { type GameView, MAX_PLAYERS, ROLES, ROLE_INFO } from "../../shared/game";
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
  const me = v.players.find((p) => p.id === v.you);
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
                  <Portrait role={p.choice} seat={p.seat} size={54} />
                  <span>{p.id === v.you ? `${p.name} (you)` : p.name}<small className="muted crew-role">{p.choice ? ROLE_INFO[p.choice].name : p.bot ? "picks at the start" : "choosing…"}</small></span>
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
                  <span>Add a bot</span>
                </button>
              </li>
            )}
            {host && n < 4 && (
              <li>
                <button className="crew-item add" onClick={() => act({ type: "fill" })}>
                  <span className="add-circle"><Icon name="plus" /></span>
                  <span>Fill to 4 with bots</span>
                </button>
              </li>
            )}
          </ul>
        </div>

        <div className="roles">
          <h2>Choose your character</h2>
          <div className="role-grid">
            {ROLES.map((r) => {
              const taker = v.players.find((p) => p.choice === r);
              const mine = taker?.id === v.you;
              return (
                <button key={r} className={`role-card ${mine ? "mine" : ""} ${taker && !mine ? "taken" : ""}`} onClick={() => act({ type: "role", role: mine ? null : r })} disabled={!!taker && !mine} aria-pressed={mine}>
                  <Portrait role={r} seat={me?.seat ?? 0} size={58} />
                  <b>{ROLE_INFO[r].name.replace("The ", "")}</b>
                  <small>{ROLE_INFO[r].power}</small>
                  {ROLE_INFO[r].mounted && <span className="tag">on horseback</span>}
                  {taker && !mine && <span className="taken-by">{taker.name}</span>}
                </button>
              );
            })}
          </div>
          <p className="small muted">Bots and anyone who doesn't choose get a character dealt at the start.</p>
        </div>

        <div className="settings">
          <div className="setting">
            <div>
              <b>Game length</b>
              <p className="small muted">{v.settings.quick ? "Quick: 3 tides of 2½ minutes, about 8 minutes" : "Full: 5 tides of 3 minutes, about 15 minutes"}</p>
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
            <button className="btn primary big" onClick={() => act({ type: "start" })} >
              {n < 2 ? "Play solo (or add bots)" : `Start with ${n} players`}
            </button>
          ) : (
            <p className="waiting">Waiting for {hostName} to start the game…</p>
          )}
          {host && n < 2 && <p className="small muted">Playing alone? Fill the seats with bots, or wait for friends to join with the code.</p>}
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
