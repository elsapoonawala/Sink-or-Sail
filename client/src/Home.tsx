import { useState } from "react";
import { ROLES, ROLE_INFO } from "../../shared/game";
import { Portrait } from "./art";
import { HomeScene } from "./HomeScene";
import { createRoom, joinRoom, savedName, toast, urlCode, useStore } from "./net";
import { sfx, startSea } from "./sound";

export function Home() {
  const { connected } = useStore();
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(urlCode());
  const [busy, setBusy] = useState(false);
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
          <h1>The Last <em>Ferry</em></h1>
          <p className="ornament" aria-hidden="true"><span />✦<span /></p>
          <p className="lede">The tide is rising over Saltmere. Race your friends across the island on foot and on horseback, haul fuel, medicine and tools to the old ferry, and grab diamonds before the sea takes them. Be on the pier when she sails.</p>
        </header>

        <div className="home-card">
          <form className="home-form" onSubmit={(e) => { e.preventDefault(); go(invited || code ? "join" : "create"); }}>
            <label htmlFor="name">Your name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={18} placeholder="e.g. Elsa" autoComplete="nickname" />
            {invited ? (
              <>
                <p className="invite">You're invited to room <b>{code}</b>.</p>
                <button className="btn primary big" type="submit" disabled={busy || !connected}>Board the ferry</button>
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
    </main>
  );
}
