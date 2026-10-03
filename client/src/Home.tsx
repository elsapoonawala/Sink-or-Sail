import { useState } from "react";
import { SceneHero } from "./art";
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
      <SceneHero />
      <div className="home-card">
        <span className="eyebrow">2 to 8 players · about 20 minutes · no sign-up</span>
        <h1>The Last <em>Ferry</em></h1>
        <p className="lede">Saltmere is sinking. Fill the old ferry with fuel, medicine and tools, and sail before the tide takes the island. Carry off what treasure you can fit.</p>
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
              <div className="join-row">
                <label htmlFor="code" className="sr">Room code</label>
                <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))} placeholder="CODE" className="code-input" autoCapitalize="characters" autoComplete="off" />
                <button className="btn brass" type="button" onClick={() => go("join")} disabled={busy || !connected || code.length !== 4}>Join</button>
              </div>
            </div>
          )}
          {!connected && <p className="muted small">Connecting to the harbour…</p>}
        </form>
      </div>
    </main>
  );
}
