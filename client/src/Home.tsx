import { useState } from "react";
import { ROLES, ROLE_INFO } from "../../shared/game";
import { Ferry, Portrait } from "./art";
import { HomeScene } from "./HomeScene";
import { Rules } from "./HowTo";
import { Sheet } from "./ui";
import { createRoom, joinRoom, savedName, toast, urlCode, useStore } from "./net";
import { sfx, startSea } from "./sound";

export function Home() {
  const { connected } = useStore();
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(urlCode());
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState(false);
  const invited = !!urlCode();

  const go = async (kind: "create" | "join") => {
    const n = name.trim();
    if (!n) {
      toast("Enter your name first.", "error");
      document.getElementById("name")?.focus();
      return;
    }
    if (kind === "join" && code.trim().length !== 4) {
      toast("Room codes are 4 letters.", "error");
      return;
    }
    setBusy(true);
    sfx.click();
    startSea();
    const r = kind === "create" ? await createRoom(n) : await joinRoom(code.trim(), n);
    setBusy(false);
    if (r.error) toast(r.error, "error");
  };

  return (
    <main className="home">
      <HomeScene />
      <div className="home-shade" aria-hidden="true" />
      <div className="home-inner">
        <header className="home-title">
          <span className="eyebrow">1 to 8 players · no sign-up</span>
          <h1>Sink <em>or</em> Sail</h1>
          <figure className="home-ship" aria-label="The ferry, the Kohinoor, at sea">
            <svg viewBox="-150 -88 300 176" aria-hidden="true">
              <defs>
                <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#2c5a6b" /><stop offset=".55" stopColor="#e9a46a" /><stop offset="1" stopColor="#f7d79a" />
                </linearGradient>
                <linearGradient id="hs-sea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#3f9aa0" /><stop offset="1" stopColor="#0d3f4c" />
                </linearGradient>
                <radialGradient id="hs-sun" cx=".5" cy=".5" r=".5">
                  <stop offset="0" stopColor="#fff4cf" /><stop offset=".45" stopColor="#ffd98a" stopOpacity=".9" /><stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
                </radialGradient>
                <clipPath id="hs-clip"><ellipse cx="0" cy="0" rx="146" ry="84" /></clipPath>
              </defs>
              <g clipPath="url(#hs-clip)">
                <rect x="-150" y="-88" width="300" height="140" fill="url(#hs-sky)" />
                <circle cx="-82" cy="38" r="44" fill="url(#hs-sun)" />
                <rect x="-150" y="40" width="300" height="52" fill="url(#hs-sea)" />
                <path d="M-120 46 h76 M-112 52 h58 M-100 58 h36" stroke="#ffe3a3" strokeWidth="1.6" opacity=".7" strokeLinecap="round" />
                <g className="hs-waves">
                  <path d="M-160 66 q10 -4 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" stroke="#bfe6e2" strokeWidth="1.2" fill="none" opacity=".55" />
                  <path d="M-170 78 q10 -4 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" stroke="#bfe6e2" strokeWidth="1" fill="none" opacity=".35" />
                </g>
                <g transform="translate(18 64) scale(.82 -.3)" opacity=".18"><Ferry fill={0.55} /></g>
                <g className="hs-bob"><g transform="translate(18 -8) scale(.82)"><Ferry fill={0.55} /></g></g>
              </g>
              <ellipse cx="0" cy="0" rx="146" ry="84" fill="none" stroke="#d2a74e" strokeWidth="3" />
              <ellipse cx="0" cy="0" rx="141" ry="79" fill="none" stroke="#f3dca0" strokeWidth=".8" opacity=".7" />
            </svg>
            <figcaption>The Kohinoor</figcaption>
          </figure>
          <p className="lede">The tide is rising over the island. Race your friends across the island on foot and on horseback, haul fuel, medicine and tools to the last ferry, <b>the Kohinoor</b>, and grab diamonds before the sea takes them. Be on the pier when she sails.</p>
        </header>

        <div className="home-card">
          <form className="home-form" onSubmit={(e) => { e.preventDefault(); go(invited || code ? "join" : "create"); }}>
            <label htmlFor="name">Your name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={18} placeholder="e.g. Elsa" autoComplete="nickname" />
            {invited ? (
              <>
                <p className="invite">You're invited to room <b>{code}</b>.</p>
                <button className="btn primary big" type="submit" disabled={busy || !connected}>Board the Kohinoor</button>
              </>
            ) : (
              <div className="home-actions">
                <button className="btn primary big" type="button" onClick={() => go("create")} disabled={busy || !connected}>Start a new room</button>
                <div className="or"><span>or join friends</span></div>
                <div className="join-row">
                  <label htmlFor="code" className="sr">Room code</label>
                  <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))} placeholder="CODE" className="code-input" autoCapitalize="characters" autoComplete="off" />
                  <button className="btn brass" type="button" onClick={() => go("join")} disabled={busy || !connected || code.length !== 4}>Join</button>
                </div>
              </div>
            )}
            {!connected && <p className="muted small">Connecting to the harbour…</p>}
          </form>
          <button className="btn ghost small" type="button" onClick={() => setRules(true)}>How to play</button>
          <ul className="home-features small">
            <li>Five rising tides</li>
            <li>Ride horses</li>
            <li>Walkie-talkie voice</li>
            <li>Bots fill empty seats</li>
          </ul>
        </div>

        <section className="home-cast" aria-label="The characters">
          <span className="eyebrow">Choose who you'll be</span>
          <ul>
            {ROLES.map((r, i) => (
              <li key={r}>
                <Portrait role={r} seat={i} size={64} />
                <b>{ROLE_INFO[r].name.replace(/^The /, "")}</b>
                <small>{ROLE_INFO[r].short}</small>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {rules && (
        <Sheet title="How to play" onClose={() => setRules(false)} wide>
          <Rules />
        </Sheet>
      )}
    </main>
  );
}
