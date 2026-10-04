import { useEffect, useState } from "react";
import { CardArt, Ferry, PearlIcon } from "./art";

const SLIDES = [
  {
    title: "Saltmere is sinking",
    body: "You and your friends are on a jewel of an island as the sea rises. One old ferry, the Saltmere Queen, waits at the pier. Load her and be aboard when she sails.",
    art: (
      <svg viewBox="-110 -50 220 130" width="220" height="130" aria-hidden="true">
        <rect x="-110" y="40" width="220" height="40" fill="url(#g-sea)" />
        <Ferry fill={0.6} />
      </svg>
    ),
  },
  {
    title: "Walk anywhere",
    body: "Use WASD or the arrow keys, or click where to go. On a phone, drag anywhere to steer or tap a spot. Scroll, pinch or use the − button to zoom out and see more of the island. Saddle a horse at the Royal Stables to ride much faster.",
    art: <div className="howto-keys"><kbd>W</kbd><div><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div></div>,
  },
  {
    title: "Carry crates to the ferry",
    body: "Walk into glowing crates to pick them up. You carry 3. Walk onto the gangway by the ferry to load them. A full game needs 8 fuel, 6 medicine and 5 tools (a quick game 4, 3 and 2). Spares you load earn a pearl each.",
    art: (
      <div className="howto-cards">
        <CardArt kind="fuel" size={50} />
        <CardArt kind="medicine" size={50} />
        <CardArt kind="tools" size={50} />
      </div>
    ),
  },
  {
    title: "Ten crates every tide",
    body: "About ten crates wash up each tide in three waves: when the tide turns, a third of the way in, and two thirds of the way in. The tide card counts down to the next wave and the news says where they landed. Each tide also brings two diamonds and fresh pearls on the beaches, and some crates hide a pearl inside.",
    art: <div className="howto-cards"><CardArt kind="tools" size={44} /><CardArt kind="diamond" size={44} /><span className="howto-pearls"><PearlIcon size={22} /><PearlIcon size={18} /></span></div>,
  },
  {
    title: "The tide takes the island",
    body: "Every few minutes the water rises and drowns the lowest places, with their crates. Dotted lines on the ground show where the next tides will reach. Grab what's low first.",
    art: <div className="howto-tide"><span /><span /><span /></div>,
  },
  {
    title: "Treasure and secrets",
    body: "Diamonds you load are yours if the ferry makes it. Dive at the coves for pearls and barter them at the market. Light the lighthouse to reveal every crate. The palace compass opens a sealed cave with three diamonds.",
    art: (
      <div className="howto-cards">
        <CardArt kind="diamond" size={54} />
        <CardArt kind="compass" size={54} />
        <span className="howto-pearls"><PearlIcon size={26} /><PearlIcon size={22} /><PearlIcon size={18} /></span>
      </div>
    ),
  },
  {
    title: "The cutlass",
    body: "About one crate a tide holds a cutlass. Walk right up to someone and strike: they're knocked out for 15 seconds and drop everything they carry, ready for you to grab. Then they're on guard for 10 seconds. The cutlass breaks after one strike. Bots use them too.",
    art: <div className="howto-cards"><CardArt kind="cutlass" size={60} /></div>,
  },
  {
    title: "All aboard",
    body: "Stand on the pier and tap Ready. When most are ready, the ferry sails in 15 seconds. After the last tide it sails anyway. With 5 or more players, a secret Wrecker may sink crates: vote them into the brig.",
    art: (
      <div className="howto-cards">
        <svg viewBox="0 0 32 44" width="40" height="54" aria-hidden="true">
          <rect x="20" y="1" width="3" height="12" rx="1.5" fill="#1d1410" />
          <rect x="5" y="10" width="22" height="32" rx="5" fill="#1d2b33" stroke="#d2a74e" strokeWidth="1.5" />
          <rect x="9" y="14" width="14" height="8" rx="2" fill="#7fe0d2" />
        </svg>
        <p className="small">Hold the walkie-talkie (or V) to talk.</p>
      </div>
    ),
  },
];

export function HowTo({ auto = false }: { auto?: boolean }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(!auto);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setI((n) => (n + 1) % SLIDES.length), 10000);
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
