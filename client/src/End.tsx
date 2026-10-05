import { useEffect, useRef } from "react";
import { type GameView, ROLE_INFO } from "../../shared/game";
import { CardArt, Ferry, PearlIcon, Portrait } from "./art";
import { ChatPanel, SignalBar } from "./Comms";
import { act, leaveRoom } from "./net";
import { sfx } from "./sound";
import { Icon, MuteButton } from "./ui";

export function End({ v }: { v: GameView }) {
  const r = v.result;
  const played = useRef(false);
  useEffect(() => {
    if (!r || played.current) return;
    played.current = true;
    sfx.horn();
    setTimeout(() => (r.success ? sfx.win() : sfx.lose()), 2200);
  }, [r]);
  if (!r) return null;
  const host = v.hostId === v.you;
  const me = v.players.find((p) => p.id === v.you)!;
  const name = (id: string) => (id === v.you ? "You" : v.players.find((p) => p.id === id)?.name ?? "?");
  const iWon = r.winners === "islanders" ? !me.wrecker : r.winners === "wrecker" ? !!me.wrecker : false;

  const headline = r.success
    ? "The Kohinoor made it across"
    : "Glug, glug... she sank";
  const left = r.fortunes.filter((f) => !f.aboard).map((f) => name(f.id));
  const sub = r.success
    ? `${r.loaded} crates were aboard${r.early ? ", and you left with time to spare" : " as the last tide came in"}.${left.length ? ` ${left.length > 1 ? `${left.slice(0, -1).join(", ")} and ${left[left.length - 1]}` : left[0]} missed the boat.` : ""}`
    : `She sailed with only ${r.loaded} of the ${r.goal} crates she needed, and went down halfway across.`;

  return (
    <main className="end">
      <div className={`voyage ${r.success ? "made-it" : "lost"}`} aria-hidden="true">
        <svg viewBox="0 0 800 260" preserveAspectRatio="xMidYMid slice">
          <rect width="800" height="260" fill="url(#g-sky)" />
          <rect y="150" width="800" height="110" fill="url(#g-sea)" />
          <rect y="160" width="800" height="100" fill="url(#p-waves)" opacity=".3" />
          <path className="sinking-island" d="M-40 160 C0 120 60 110 120 130 C150 140 170 150 190 160 Z" fill="#2c6b4a" />
          <g className="sail-path"><g transform="translate(0 112) scale(.8)"><Ferry fill={Math.min(1, v.loaded / v.goal)} sailing /></g></g>
          {r.success && <path className="far-shore" d="M700 160 C730 140 780 136 820 140 L820 160Z" fill="#3f8a5a" />}
        </svg>
      </div>

      <section className="end-card">
        <span className={`verdict ${iWon ? "won" : "lost"}`}>{iWon ? "You win" : r.winners === "nobody" ? "Everyone lost" : "You lose"}</span>
        <h1>{headline}</h1>
        <p className="lede">{sub}</p>

        <div className="end-gauges">
          <div className={`goal-bar big ${r.success ? "ok" : "short"}`}>
            <span className="goal-label">Crates aboard</span>
            <span className="goal-track"><span style={{ width: `${Math.min(100, (r.loaded / r.goal) * 100)}%` }} /></span>
            <b>{r.loaded}/{r.goal}</b>
          </div>
        </div>

        {r.wreckers.length > 0 && (
          <div className="unmask">
            <h2>{r.winners === "wrecker" ? "The Wrecker got away with it" : "The Wrecker is unmasked"}</h2>
            <div className="row gap wrap center">
              {r.wreckers.map((id) => {
                const p = v.players.find((x) => x.id === id)!;
                return (
                  <div key={id} className="unmask-face">
                    <Portrait role={p.role} seat={p.seat} size={72} />
                    <b>{name(id)}</b>
                    <span className="small muted">{p.role ? ROLE_INFO[p.role].name : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {r.success && (
          <div className="fortunes">
            <h2>Fortunes carried off</h2>
            <ol>
              {r.fortunes.filter((f) => !v.players.find((p) => p.id === f.id)?.wrecker).map((f) => {
                if (!f.aboard) {
                  const p = v.players.find((x) => x.id === f.id)!;
                  return (
                    <li key={f.id} className="left-behind">
                      <Portrait role={p.role} seat={p.seat} size={40} />
                      <span className="f-name">{name(f.id)}</span>
                      <span className="f-detail muted">left behind on the island</span>
                      <b className="f-total">0</b>
                    </li>
                  );
                }
                const p = v.players.find((x) => x.id === f.id)!;
                const crowned = r.grandFortune.includes(f.id);
                return (
                  <li key={f.id} className={crowned ? "crowned" : ""}>
                    <Portrait role={p.role} seat={p.seat} size={40} />
                    <span className="f-name">{name(f.id)} {crowned && <span className="crown"><Icon name="crown" size={14} /> Grand Fortune</span>}</span>
                    <span className="f-detail">
                      {f.diamonds > 0 && <><CardArt kind="diamond" size={16} />×{f.diamonds} </>}
                      <PearlIcon size={14} />×{f.pearls}
                    </span>
                    <b className="f-total">{f.fortune}</b>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <div className="end-actions">
          {host ? (
            <>
              <button className="btn primary big" onClick={() => act({ type: "start" })} disabled={v.phase !== "over"}>
                Play again
              </button>
              <button className="btn ghost" onClick={() => act({ type: "lobby" })}>Back to lobby</button>
            </>
          ) : (
            <p className="waiting">Waiting for the host to start the next game…</p>
          )}
          <button className="btn ghost small" onClick={leaveRoom}>Leave room</button>
        </div>
      </section>

      <aside className="end-chat">
        <div className="row gap"><MuteButton /> <span className="small muted">Talk it over</span></div>
        <SignalBar compact />
        <ChatPanel v={v} />
      </aside>
    </main>
  );
}
