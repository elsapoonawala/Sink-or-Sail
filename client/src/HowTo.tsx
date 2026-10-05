import { useEffect, useState } from "react";
import { ROLES, ROLE_INFO } from "../../shared/game";
import { CardArt, Ferry, PearlIcon } from "./art";

const SLIDES = [
  {
    title: "The goal",
    body: "Saltmere is sinking. Work together to load the old ferry with 8 fuel, 6 medicine and 5 tools, then be standing on the pier when she sails. If she sails with everything aboard, everyone on the pier escapes, and the richest passenger wins.",
    art: (
      <svg viewBox="-110 -50 220 130" width="220" height="130" aria-hidden="true">
        <rect x="-110" y="40" width="220" height="40" fill="url(#g-sea)" />
        <Ferry fill={0.6} />
      </svg>
    ),
  },
  {
    title: "Walk anywhere",
    body: "WASD or arrow keys, or click where to go. On a phone, drag anywhere to steer or tap a spot. Scroll, pinch or use − and + to zoom out. Saddle a horse at the Royal Stables to ride faster.",
    art: <div className="howto-keys"><kbd>W</kbd><div><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div></div>,
  },
  {
    title: "Grab crates, load the ferry",
    body: "Walk into a glowing crate to pick it up (you carry 3). To load, step onto the gold circle marked LOAD HERE beside the ferry: your crates go in by themselves (or tap the Load button near the dock). About 18 crates wash up every tide, in three waves, and every wave puts 2 crates with your name near you that only you can pick up.",
    art: (
      <div className="howto-cards">
        <CardArt kind="fuel" size={50} />
        <CardArt kind="medicine" size={50} />
        <CardArt kind="tools" size={50} />
      </div>
    ),
  },
  {
    title: "The tide is rising",
    body: "Five tides of three minutes. Each new tide floods the lowest places for good, with any crates on them. The map says when each place floods. When the last tide runs out, the ferry leaves.",
    art: <div className="howto-tide"><span /><span /><span /></div>,
  },
  {
    title: "Your secret order",
    body: "Every tide a passenger gives you a private order, like 2 medicine and 1 tools. Load those crates yourself to earn 6 pearls, then you get a new order at the next tide. If someone is holding what you need, tap Trade and make them an offer, from anywhere on the island.",
    art: <div className="howto-cards"><CardArt kind="medicine" size={44} /><CardArt kind="tools" size={44} /><span className="howto-pearls"><PearlIcon size={26} /><PearlIcon size={22} /></span></div>,
  },
  {
    title: "Get rich",
    body: "Your fortune is your pearls plus 3 for every diamond you load. Pick pearls up on beaches, dive at the coves, fill orders. Two diamonds turn up each tide, and three more sit in the sealed cave: carry the palace compass to its door.",
    art: (
      <div className="howto-cards">
        <CardArt kind="diamond" size={54} />
        <CardArt kind="compass" size={54} />
      </div>
    ),
  },
  {
    title: "The cutlass",
    body: "About one crate a tide holds a cutlass. While you hold it, a red Attack button stays on screen and a red arrow points to the nearest player. Walk up to them and tap Attack: they're knocked out for 15 seconds and drop everything they carry. It breaks after one hit.",
    art: <div className="howto-cards"><CardArt kind="cutlass" size={60} /></div>,
  },
  {
    title: "All aboard",
    body: "Stand on the pier and tap Ready. When more than half are ready, the ferry sails in 15 seconds. Anyone not on the pier is left behind with nothing. Hold the walkie-talkie (or V) to talk.",
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

const QUICK: { icon: string; text: React.ReactNode }[] = [
  { icon: "📦", text: <>Walk into glowing crates to pick them up. The ones with <b>your name</b> are only for you.</> },
  { icon: "⛴", text: <>Step onto the gold <b>LOAD HERE</b> circle by the ferry to load them.</> },
  { icon: "🎯", text: <>Fill the ferry: <b>8 fuel, 6 medicine, 5 tools</b> before the last tide.</> },
  { icon: "💎", text: <>Get rich: pearls, diamonds, and your secret order. <b>Trade</b> with anyone, any time.</> },
  { icon: "⚓", text: <>Be <b>on the pier</b> when she sails, or you're left behind.</> },
];

/** Five lines to start playing; the full details stay one tap away. */
export function Rules() {
  const [more, setMore] = useState(false);
  return (
    <div className="rules">
      <ol className="quick-rules">
        {QUICK.map((r, i) => (
          <li key={i}><span aria-hidden="true">{r.icon}</span><p>{r.text}</p></li>
        ))}
      </ol>
      <p className="quick-foot">That's all you need. Hints on screen guide you through the first tide.</p>
      <button className="btn ghost small" type="button" onClick={() => setMore(!more)} aria-expanded={more}>{more ? "Hide the details" : "All the details"}</button>
      {more && <FullRules />}
    </div>
  );
}

/** The complete rules, for anyone who wants every detail. */
function FullRules() {
  return (
    <div className="rules">
      <section>
        <h4>1. The goal</h4>
        <p>Saltmere is sinking. Everyone works together to load the ferry with the supplies she needs, then stands on the pier when she sails. If she sails with every supply aboard, everyone on the pier escapes and the player with the biggest fortune wins. If anything is missing, she never makes it and nobody wins (unless there's a Wrecker, who wins instead).</p>
      </section>
      <section>
        <h4>2. Time</h4>
        <ul>
          <li>A full game is 5 tides of 3 minutes. A quick game is 3 tides of 2½ minutes.</li>
          <li>Each new tide raises the sea and floods the lowest places for good, along with any crates on them. The map lists when each place floods, and dotted lines on the ground show where the water will reach.</li>
          <li>The ferry sails when the last tide runs out, or earlier if more than half the players tap <b>Ready</b> on the pier (a 15-second countdown starts).</li>
        </ul>
      </section>
      <section>
        <h4>3. Moving</h4>
        <ul>
          <li>Laptop: WASD or arrow keys, or click where to go. Scroll to zoom.</li>
          <li>Phone: drag anywhere for a joystick, or tap where to go. Pinch to zoom. The − and + buttons by the map zoom too.</li>
          <li>Walk up to the Royal Stables and tap <b>Saddle a horse</b> to ride much faster.</li>
          <li>Shallow water slows you down; deep water stops you.</li>
        </ul>
      </section>
      <section>
        <h4>4. Crates and the ferry</h4>
        <ul>
          <li>Walk into a glowing crate to pick it up. You carry 3 at a time (the Engineer carries 4). Tap something in your hands to drop it.</li>
          <li>To load, step onto the gold circle marked <b>LOAD HERE</b> at the ferry's gangway. Everything you carry goes into the hold by itself, and a message confirms it. Near the dock, the <b>Load</b> button walks you there.</li>
          <li>The ferry needs <b>8 fuel, 6 medicine and 5 tools</b> (quick game: 4, 3 and 2). The gauges at the top of the screen show what's aboard. The Antique Compass counts as 1 fuel once it's loaded.</li>
          <li>The hold has 30 spaces (quick game: 16), and a diamond takes 2 of them. The hold always keeps room for supplies the ferry still needs.</li>
          <li>About 18 crates wash up each tide in three waves: when the tide turns, a third of the way through, and two thirds of the way through. The game starts with two waves already out. The tide card counts down to the next wave.</li>
          <li>Every wave also puts <b>2 crates with your name</b> on them near you. Only you can pick those up. Gold pointers at the edge of the screen lead to the nearest crates.</li>
          <li>Bots carry at most 2 crates, move a little slower than people, and leave alone crates that you're close to.</li>
        </ul>
      </section>
      <section>
        <h4>5. Your secret order</h4>
        <ul>
          <li>A passenger gives you a private order such as "2 medicine + 1 tools". It shows above your hands, and only you can see it.</li>
          <li>Crates <b>you</b> load count toward it. Fill it to earn <b>6 pearls</b>. An unfinished order carries over; once it's filled you get a new one at the next tide.</li>
        </ul>
      </section>
      <section>
        <h4>6. Trading</h4>
        <ul>
          <li>Tap <b>Trade</b> (bottom of the screen) at any time, from anywhere, and pick a player. Offer crates or pearls you have in return for crates or pearls they have. If they accept, the swap happens at once.</li>
          <li>The trade list marks who is carrying what your order needs. Bots trade too, and will send you offers.</li>
        </ul>
      </section>
      <section>
        <h4>7. Pearls, diamonds and your fortune</h4>
        <ul>
          <li>Your fortune is your pearls plus <b>3 for every diamond</b> you loaded (or carried onto the pier). It only counts if the ferry makes it and you're aboard.</li>
          <li>Pearls come from piles on beaches and gardens, diving at the buoys in Turquoise Coves, some crates, filled orders (+6), and spare supplies you load once the ferry has enough of that kind (+1 each).</li>
          <li>The Pearl Market sells a supply crate for 3 pearls (3 crates a tide). The merchant sometimes says no; just ask again.</li>
          <li>Two diamonds turn up each tide. Three more lie in the sealed Sapphire Caves: carry the Antique Compass from the palace to the cave door to open it.</li>
          <li>Light the lighthouse lamp (once a tide) to show every crate on the map for 45 seconds and reveal a hidden stepping-stone path.</li>
        </ul>
      </section>
      <section>
        <h4>8. The cutlass</h4>
        <p>About one crate a tide holds a cutlass. While you hold it, a red <b>Attack</b> button stays on screen and a red arrow points to the nearest player. Walk right up to them and tap Attack: they're knocked out for 15 seconds and drop everything they carry. The cutlass breaks after one hit, and a player who was just knocked out can't be hit again for 10 seconds after they get up.</p>
      </section>
      <section>
        <h4>9. Sailing</h4>
        <p>Be on the wooden pier when the ferry leaves. Anyone off the pier is left behind and their fortune is lost. The ferry won't wait.</p>
      </section>
      <section>
        <h4>10. Characters</h4>
        <ul>
          {ROLES.map((r) => <li key={r}><b>{ROLE_INFO[r].name}:</b> {ROLE_INFO[r].power}</li>)}
        </ul>
      </section>
      <section>
        <h4>11. The secret Wrecker (5 or more players, or switched on in the lobby)</h4>
        <ul>
          <li>One player (two with 7 or more) is secretly a Wrecker. Wreckers win if the ferry sails without everything it needs.</li>
          <li>Standing at the gangway, a Wrecker can secretly sink a supply from the hold every 45 seconds.</li>
          <li>Each player can accuse someone once per game. If a majority votes yes, the accused is locked in the ferry's brig and their cargo spills on the pier.</li>
        </ul>
      </section>
    </div>
  );
}

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
