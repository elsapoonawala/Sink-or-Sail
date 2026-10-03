import { useEffect, useState } from "react";
import { CardArt, Ferry, PearlIcon } from "./art";

const SLIDES = [
  {
    title: "Saltmere is sinking",
    body: "One old ferry waits at the harbour. Fill its hold with the supplies shown on the brass gauges, then sail together before the island goes under.",
    art: (
      <svg viewBox="-110 -50 220 130" width="220" height="130" aria-hidden="true">
        <rect x="-110" y="40" width="220" height="40" fill="url(#g-sea)" />
        <Ferry fill={0.6} />
      </svg>
    ),
  },
  {
    title: "Each tide: search, trade, load",
    body: "Tap a place on the island to search it. Then swap cards with anyone, adding pearls to sweeten a deal. Then load up to 2 cards onto the ferry. A banner always tells you what to do.",
    art: (
      <div className="howto-cards">
        <CardArt kind="fuel" size={50} />
        <CardArt kind="medicine" size={50} />
        <CardArt kind="tools" size={50} />
      </div>
    ),
  },
  {
    title: "Space is precious",
    body: "Treasure you load is yours to keep if the ferry makes it: diamonds are worth 3, each pearl 1. But a diamond takes 2 slots that fuel could have used. One place floods every tide, and flooded places give fewer cards.",
    art: (
      <div className="howto-cards">
        <CardArt kind="diamond" size={54} />
        <CardArt kind="compass" size={54} />
        <span className="howto-pearls"><PearlIcon size={26} /><PearlIcon size={22} /><PearlIcon size={18} /></span>
      </div>
    ),
  },
  {
    title: "Sail together",
    body: "Tap Ready to leave when you think the ferry has enough. When more than half the table is ready, it sails. After the last tide it sails no matter what. With 5 or more players, a secret Wrecker may be slipping spoiled crates aboard.",
    art: (
      <div className="howto-cards">
        <CardArt kind="spoiled" size={54} />
      </div>
    ),
  },
];

export function HowTo({ auto = false }: { auto?: boolean }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(!auto);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setI((n) => (n + 1) % SLIDES.length), 9000);
    return () => clearTimeout(t);
  }, [i, paused]);
  const s = SLIDES[i];
  return (
    <div className="howto" onPointerDown={() => setPaused(true)}>
      <div className="howto-art">{s.art}</div>
      <div className="howto-text">
        <span className="eyebrow">How to play · {i + 1} of {SLIDES.length}</span>
        <h3>{s.title}</h3>
        <p>{s.body}</p>
      </div>
      <div className="howto-nav">
        <button className="btn ghost small" onClick={() => setI((i + SLIDES.length - 1) % SLIDES.length)} aria-label="Previous">‹</button>
        <div className="dots">
          {SLIDES.map((_, n) => (
            <button key={n} className={n === i ? "on" : ""} onClick={() => setI(n)} aria-label={`Slide ${n + 1}`} />
          ))}
        </div>
        <button className="btn ghost small" onClick={() => setI((i + 1) % SLIDES.length)} aria-label="Next">›</button>
      </div>
    </div>
  );
}
