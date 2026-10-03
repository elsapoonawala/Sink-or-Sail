import { useEffect } from "react";
import { ArtDefs } from "./art";
import { End } from "./End";
import { Game } from "./Game";
import { Home } from "./Home";
import { Lobby } from "./Lobby";
import { bootSession, useStore } from "./net";

export function App() {
  const { view, session, toast, connected } = useStore();
  useEffect(() => {
    bootSession();
  }, []);

  let screen;
  if (session && !view) screen = <div className="loading"><p>Rejoining room {session.code}…</p></div>;
  else if (!view) screen = <Home />;
  else if (view.phase === "lobby") screen = <Lobby v={view} />;
  else if (view.phase === "voyage" || view.phase === "over") screen = <End v={view} />;
  else screen = <Game v={view} />;

  return (
    <>
      <ArtDefs />
      {screen}
      {session && !connected && <div className="offline">Reconnecting to the harbour…</div>}
      {toast && <div key={toast.id} className={`toast ${toast.tone}`} role="status">{toast.text}</div>}
    </>
  );
}
