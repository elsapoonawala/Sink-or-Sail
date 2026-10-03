// Hand-drawn vector art: cards, portraits, the island and the ferry.
import type { Kind, Role } from "../../shared/game";

export const SEAT_COLORS = ["#3fc1b5", "#d2a74e", "#e7849a", "#9fd6ee", "#c9b6e4", "#ef8f6b", "#7fcf8f", "#f1ead9"];
const SKIN = ["#f1c9a5", "#c98e62", "#8d5a3b", "#e8b48c", "#5e3a24", "#f6d7bd", "#b27a50", "#a8693f"];
const HAIR = ["#2b1d14", "#6b3d1f", "#111111", "#b98a4a", "#3a2a22", "#8a8a8a", "#1d1410", "#a0522d"];

/** Shared gradients, rendered once at the app root. */
export function ArtDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <radialGradient id="g-pearl" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".45" stopColor="#f3ece0" />
          <stop offset=".8" stopColor="#d9cbb7" />
          <stop offset="1" stopColor="#b9a891" />
        </radialGradient>
        <linearGradient id="g-dia" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9fbff" />
          <stop offset=".5" stopColor="#8fd4ef" />
          <stop offset="1" stopColor="#3d8fb8" />
        </linearGradient>
        <linearGradient id="g-brass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0cf7e" />
          <stop offset="1" stopColor="#9c7425" />
        </linearGradient>
        <linearGradient id="g-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2fb3aa" />
          <stop offset=".55" stopColor="#167a80" />
          <stop offset="1" stopColor="#0d4651" />
        </linearGradient>
        <linearGradient id="g-sea-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d6f78" />
          <stop offset="1" stopColor="#0a2d36" />
        </linearGradient>
        <radialGradient id="g-shallows" cx="50%" cy="50%" r="50%">
          <stop offset=".7" stopColor="#7fe0d2" stopOpacity=".0" />
          <stop offset=".86" stopColor="#7fe0d2" stopOpacity=".55" />
          <stop offset="1" stopColor="#7fe0d2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="g-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b3f5c" />
          <stop offset=".55" stopColor="#d98a6a" />
          <stop offset="1" stopColor="#f3c98b" />
        </linearGradient>
        <linearGradient id="g-card" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8f1df" />
          <stop offset="1" stopColor="#e4d7b8" />
        </linearGradient>
        <pattern id="p-waves" width="24" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 6 q6 -5 12 0 t12 0" fill="none" stroke="#bff2ea" strokeWidth="1.3" opacity=".7" />
        </pattern>
      </defs>
    </svg>
  );
}

export function CardArt({ kind, size = 56 }: { kind: Kind | "spoiled" | "pearl"; size?: number }) {
  return (
    <svg viewBox="0 0 120 84" width={size * 1.43} height={size} aria-hidden="true">
      {kind === "pearl" && (
        <g>
          <ellipse cx="60" cy="72" rx="30" ry="5" fill="#000" opacity=".12" />
          <circle cx="47" cy="46" r="17" fill="url(#g-pearl)" />
          <circle cx="75" cy="50" r="13" fill="url(#g-pearl)" />
          <circle cx="61" cy="30" r="10" fill="url(#g-pearl)" />
        </g>
      )}
      {kind === "diamond" && (
        <g>
          <ellipse cx="60" cy="77" rx="26" ry="4" fill="#000" opacity=".12" />
          <path d="M34 28 L47 13 H73 L86 28 L60 72 Z" fill="url(#g-dia)" stroke="#2c6d8f" strokeWidth="1.2" />
          <path d="M34 28 H86 M47 13 L54 28 L60 72 M73 13 L66 28 L60 72 M54 28 L60 13 L66 28" stroke="#2c6d8f" strokeWidth=".9" fill="none" />
          <path d="M49 17 L45 25" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
          <circle className="sparkle" cx="80" cy="16" r="2.5" fill="#fff" />
        </g>
      )}
      {kind === "compass" && (
        <g>
          <circle cx="60" cy="45" r="30" fill="url(#g-brass)" />
          <circle cx="60" cy="45" r="24" fill="#f4ecd8" stroke="#8a6420" />
          <g stroke="#8a6420" strokeWidth="1">
            <path d="M60 23 v4 M60 63 v4 M38 45 h4 M78 45 h4" />
          </g>
          <path d="M60 25 L65.5 45 L60 65 L54.5 45 Z" fill="#b8434f" />
          <path d="M60 45 L65.5 45 L60 65 L54.5 45 Z" fill="#33403f" />
          <circle cx="60" cy="45" r="2.5" fill="#8a6420" />
          <rect x="56" y="9" width="8" height="8" rx="2" fill="url(#g-brass)" />
        </g>
      )}
      {kind === "fuel" && (
        <g>
          <ellipse cx="60" cy="77" rx="24" ry="4" fill="#000" opacity=".12" />
          <rect x="40" y="22" width="40" height="53" rx="5" fill="#c9783a" stroke="#7d4520" />
          <rect x="63" y="12" width="12" height="12" rx="2" fill="#7d4520" />
          <path d="M44 22 q-8 -10 4 -12 h10" fill="none" stroke="#7d4520" strokeWidth="3" />
          <rect x="45" y="40" width="30" height="16" fill="#f4ecd8" />
          <text x="60" y="52" fontSize="9" textAnchor="middle" fill="#7d4520" fontFamily="Courier Prime, monospace" fontWeight="700">FUEL</text>
        </g>
      )}
      {kind === "medicine" && (
        <g>
          <ellipse cx="60" cy="77" rx="20" ry="4" fill="#000" opacity=".12" />
          <rect x="44" y="26" width="32" height="50" rx="8" fill="#e3f0ec" stroke="#5a7b74" />
          <rect x="49" y="13" width="22" height="13" rx="2" fill="#b8434f" />
          <rect x="49" y="13" width="22" height="3" fill="#8a2f39" />
          <rect x="56" y="40" width="8" height="22" fill="#b8434f" />
          <rect x="49" y="47" width="22" height="8" fill="#b8434f" />
          <path d="M50 32 v38" stroke="#fff" strokeWidth="3" opacity=".6" strokeLinecap="round" />
        </g>
      )}
      {kind === "tools" && (
        <g>
          <ellipse cx="60" cy="77" rx="34" ry="4" fill="#000" opacity=".12" />
          <rect x="26" y="36" width="68" height="38" rx="5" fill="#6b4a2f" stroke="#3f2a19" />
          <path d="M47 36 v-9 h26 v9" fill="none" stroke="#3f2a19" strokeWidth="4" />
          <rect x="26" y="49" width="68" height="5" fill="#d2a74e" />
          <rect x="56" y="46" width="8" height="11" rx="1.5" fill="url(#g-brass)" />
          <path d="M34 30 l14 -14 M44 14 a5 5 0 1 0 6 6" stroke="#9aa5a6" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </g>
      )}
      {kind === "spoiled" && (
        <g>
          <rect x="40" y="22" width="40" height="53" rx="5" fill="#8c7a63" stroke="#4d3f2f" />
          <rect x="63" y="12" width="12" height="12" rx="2" fill="#4d3f2f" />
          <path d="M47 34 l9 11 -7 9 11 13" stroke="#b8434f" strokeWidth="3" fill="none" />
          <circle cx="70" cy="60" r="5" fill="#4d3f2f" opacity=".55" />
          <circle cx="66" cy="34" r="3" fill="#4d3f2f" opacity=".45" />
        </g>
      )}
    </svg>
  );
}

export function PearlIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill="url(#g-pearl)" stroke="#b9a891" strokeWidth=".6" />
    </svg>
  );
}

/** A painted bust for each role. Seat picks the skin tone, hair and backdrop. */
export function Portrait({ role, seat, size = 48 }: { role: Role | null; seat: number; size?: number }) {
  const skin = SKIN[seat % SKIN.length];
  const hair = HAIR[(seat * 3) % HAIR.length];
  const back = SEAT_COLORS[seat % SEAT_COLORS.length];
  const outfit: Record<string, string> = {
    diver: "#127077", engineer: "#5b4636", physician: "#6e6150", cartographer: "#4f3d73", jeweler: "#1f3d4a", duchess: "#1f6b4a", none: "#2b4650",
  };
  const r = role ?? "none";
  const id = `clip-${seat}-${size}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className="portrait-svg">
      <defs>
        <clipPath id={id}><circle cx="50" cy="50" r="48" /></clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill={back} />
      <g clipPath={`url(#${id})`}>
        <circle cx="50" cy="50" r="48" fill="#0b2a33" opacity=".22" />
        {/* shoulders and coat */}
        <path d="M10 104 C12 78 30 68 50 68 C70 68 88 78 90 104 Z" fill={outfit[r]} />
        {r === "jeweler" && <path d="M40 70 L50 86 L60 70" fill="#f1ead9" />}
        {r === "physician" && <path d="M42 69 L50 80 L58 69" fill="#e8e1cf" />}
        {r === "duchess" && <path d="M20 84 q30 -14 60 0 l0 -6 q-30 -12 -60 0z" fill="#e9e3d6" opacity=".9" />}
        {/* neck and head */}
        <rect x="43" y="56" width="14" height="14" rx="5" fill={skin} />
        <ellipse cx="50" cy="44" rx="16" ry="18" fill={skin} />
        {/* hair */}
        {r === "duchess" ? (
          <path d="M33 44 C32 26 44 22 50 22 C58 22 69 27 67 44 C66 36 60 30 50 30 C40 30 35 36 33 44 Z" fill={hair} />
        ) : r === "diver" ? null : (
          <path d="M34 42 C33 28 42 24 50 24 C59 24 67 29 66 42 C63 34 57 31 50 31 C43 31 37 34 34 42 Z" fill={hair} />
        )}
        {/* eyes and smile */}
        <circle cx="44" cy="45" r="1.6" fill="#2b1d14" />
        <circle cx="56" cy="45" r="1.6" fill="#2b1d14" />
        <path d="M45 53 q5 3.5 10 0" stroke="#7a3b2e" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        {/* signature pieces */}
        {r === "diver" && (
          <g>
            <path d="M32 44 C30 24 70 24 68 44 C64 32 36 32 32 44 Z" fill="#3fc1b5" />
            <path d="M66 40 q10 6 6 18 q-4 -8 -8 -10z" fill="#3fc1b5" />
            <circle cx="34" cy="50" r="2.4" fill="url(#g-pearl)" />
            <path d="M24 92 q26 -14 52 0" stroke="#bff2ea" strokeWidth="3" fill="none" />
          </g>
        )}
        {r === "engineer" && (
          <g>
            <rect x="33" y="31" width="34" height="5" fill="#3a2a22" />
            <circle cx="43" cy="33" r="6" fill="#9fd6ee" stroke="url(#g-brass)" strokeWidth="3" />
            <circle cx="57" cy="33" r="6" fill="#9fd6ee" stroke="url(#g-brass)" strokeWidth="3" />
            <rect x="30" y="80" width="40" height="5" fill="#d2a74e" opacity=".8" />
          </g>
        )}
        {r === "physician" && (
          <g>
            <circle cx="44" cy="45" r="5" fill="none" stroke="#c9a352" strokeWidth="1.6" />
            <circle cx="56" cy="45" r="5" fill="none" stroke="#c9a352" strokeWidth="1.6" />
            <path d="M49 45 h2" stroke="#c9a352" strokeWidth="1.6" />
            <path d="M44 72 l6 4 6 -4 -6 -4z" fill="#b8434f" />
          </g>
        )}
        {r === "cartographer" && (
          <g>
            <path d="M28 33 q22 -18 44 0 q-22 -6 -44 0z" fill="#2f2346" />
            <path d="M30 32 q20 -4 40 0 l-2 4 q-18 -3 -36 0z" fill="#2f2346" />
            <path d="M64 24 q10 -8 12 2 q-6 -2 -10 2z" fill="#d2a74e" />
            <rect x="66" y="74" width="8" height="26" rx="2" fill="#8a6420" transform="rotate(-20 70 86)" />
          </g>
        )}
        {r === "jeweler" && (
          <g>
            <circle cx="56" cy="45" r="5.5" fill="#bfe8f5" opacity=".5" stroke="url(#g-brass)" strokeWidth="2" />
            <path d="M61 47 q6 8 2 18" stroke="#d2a74e" strokeWidth="1" fill="none" />
            <circle cx="36" cy="82" r="4" fill="#b8434f" stroke="url(#g-brass)" strokeWidth="1.6" />
            <path d="M44 31 q6 -3 12 0" stroke={hair} strokeWidth="2" fill="none" />
          </g>
        )}
        {r === "duchess" && (
          <g>
            <path d="M37 27 l3 -9 5 6 5 -9 5 9 5 -6 3 9z" fill="url(#g-brass)" />
            <circle cx="50" cy="16" r="2.2" fill="#9fd6ee" />
            <circle cx="40" cy="20" r="1.6" fill="url(#g-pearl)" />
            <circle cx="60" cy="20" r="1.6" fill="url(#g-pearl)" />
            {[38, 43, 48, 53, 58, 63].map((x, i) => (
              <circle key={i} cx={x - 0.5} cy={68 + Math.abs(i - 2.5) * -1.2 + 3} r="2" fill="url(#g-pearl)" />
            ))}
          </g>
        )}
        {r === "none" && <path d="M38 70 q12 6 24 0" stroke="#d2a74e" strokeWidth="2" fill="none" />}
      </g>
      <circle cx="50" cy="50" r="47" fill="none" stroke="url(#g-brass)" strokeWidth="3" />
    </svg>
  );
}

// ---------- island ----------

type Place = "palace" | "gardens" | "hotel" | "market" | "coves" | "harbour";

function PlaceArt({ place }: { place: Place }) {
  switch (place) {
    case "palace":
      return (
        <g>
          <rect x="-48" y="-6" width="96" height="40" fill="#f4e6cf" />
          <rect x="-62" y="6" width="18" height="28" fill="#efdcbd" />
          <rect x="44" y="6" width="18" height="28" fill="#efdcbd" />
          <path d="M-18 -6 Q0 -40 18 -6 Z" fill="#d2a74e" />
          <rect x="-1.5" y="-48" width="3" height="12" fill="#d2a74e" />
          <path d="M-62 6 l9 -12 9 12z M44 6 l9 -12 9 12z" fill="#b8434f" />
          {[-38, -22, 14, 30].map((x) => <rect key={x} x={x} y="6" width="7" height="14" rx="3.5" fill="#c98b5e" />)}
          <rect x="-7" y="16" width="14" height="18" rx="7" fill="#5b3b2b" />
          <path d="M-70 34 h140" stroke="#e8d2b0" strokeWidth="4" />
        </g>
      );
    case "gardens":
      return (
        <g>
          <path d="M-60 30 h120 v8 h-120z M-48 14 h96 v8 h-96z" fill="#cdb48a" />
          {[-44, -20, 6, 30, 50].map((x, i) => (
            <g key={x}>
              <circle cx={x} cy={i % 2 ? 4 : 8} r="14" fill="#1f5a3c" />
              <circle cx={x + 6} cy={i % 2 ? -2 : 2} r="9" fill="#2c7a4e" />
              <circle cx={x - 4} cy={i % 2 ? 2 : 6} r="2.6" fill="#f3cf6a" />
              <circle cx={x + 8} cy={i % 2 ? 6 : 10} r="2.6" fill="#e7849a" />
            </g>
          ))}
        </g>
      );
    case "hotel":
      return (
        <g>
          <rect x="-56" y="-26" width="112" height="60" fill="#f2d7c1" />
          <rect x="-60" y="-34" width="120" height="9" fill="#b8434f" />
          <rect x="-20" y="-46" width="40" height="13" fill="#f2d7c1" />
          <text x="0" y="-36" fontSize="8" textAnchor="middle" fill="#8a6420" fontFamily="Bodoni Moda, serif" fontWeight="700">BELVEDERE</text>
          {[-44, -26, 14, 32].map((x) => (
            <g key={x}>
              <rect x={x} y="-16" width="11" height="13" fill="#7a9ea0" />
              <rect x={x} y="6" width="11" height="13" fill="#7a9ea0" />
            </g>
          ))}
          <rect x="-8" y="10" width="16" height="24" rx="8" fill="#5b3b2b" />
          <path d="M-16 6 h32 l-4 -6 h-24z" fill="#3fc1b5" />
        </g>
      );
    case "market":
      return (
        <g>
          {[
            [-60, "#3fc1b5"], [-20, "#f1ead9"], [20, "#d2a74e"],
          ].map(([x, c]) => (
            <g key={x as number}>
              <path d={`M${x} -8 h38 l-6 14 h-26z`} fill={c as string} />
              <path d={`M${(x as number) + 6} 6 h26 v20 h-26z`} fill="#e8d2b0" />
              <circle cx={(x as number) + 14} cy="16" r="3.5" fill="url(#g-pearl)" />
              <circle cx={(x as number) + 23} cy="17" r="3" fill="url(#g-pearl)" />
            </g>
          ))}
          <path d="M-62 -8 v34 M60 -8 v34" stroke="#6b4a2f" strokeWidth="2" />
        </g>
      );
    case "coves":
      return (
        <g>
          <path d="M-70 26 q30 -30 70 -14 q34 12 70 -6 v22 h-140z" fill="#f3e1b5" />
          <path d="M-40 14 q-4 -30 6 -46" stroke="#6b4a2f" strokeWidth="4" fill="none" />
          <path d="M-34 -32 q-22 -2 -30 10 M-34 -32 q-6 -18 -24 -18 M-34 -32 q14 -16 30 -10 M-34 -32 q20 0 26 14" stroke="#2c7a4e" strokeWidth="6" fill="none" strokeLinecap="round" />
          <ellipse cx="34" cy="20" rx="9" ry="4" fill="#fff" opacity=".6" />
          <circle cx="16" cy="18" r="3" fill="url(#g-pearl)" />
        </g>
      );
    case "harbour":
      return (
        <g>
          <rect x="-66" y="-6" width="36" height="30" fill="#d9c7a7" />
          <path d="M-70 -6 l20 -14 20 14z" fill="#8a5a3c" />
          <rect x="-22" y="0" width="30" height="24" fill="#c9b18a" />
          <path d="M-24 0 l17 -12 17 12z" fill="#6b4a2f" />
          <path d="M18 -36 v60 M18 -30 l26 0 M18 -30 l22 26" stroke="#5a3d27" strokeWidth="3" fill="none" />
          <rect x="30" y="2" width="12" height="10" fill="#c9783a" />
          <rect x="44" y="6" width="10" height="8" fill="#6b4a2f" />
          <rect x="-70" y="24" width="150" height="6" fill="#6b4a2f" />
        </g>
      );
  }
}

export function Ferry({ fill = 0, sailing = false }: { fill?: number; sailing?: boolean }) {
  // fill: 0..1, how loaded the hold looks (crates stacked on deck)
  const crates = Math.round(fill * 8);
  return (
    <g className={sailing ? "ferry sailing" : "ferry"}>
      <path d="M-80 44 L90 44 L72 70 L-62 70 Z" fill="#f4efe6" />
      <path d="M-80 44 L90 44 L88 50 L-78 50 Z" fill="#b8434f" />
      <path d="M-62 70 L72 70 L70 66 L-60 66Z" fill="#0b2a33" opacity=".35" />
      <rect x="-50" y="22" width="112" height="22" fill="#f8f4ea" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={-44 + i * 13} y="28" width="8" height="8" rx="4" fill="#2a5560" />
      ))}
      <rect x="-30" y="6" width="70" height="16" fill="#efe7d6" />
      <rect x="-24" y="10" width="20" height="6" fill="#2a5560" />
      <rect x="0" y="-22" width="16" height="28" fill="#b8434f" />
      <rect x="0" y="-22" width="16" height="6" fill="#1f2a2c" />
      <path d="M-30 6 L-70 40 M40 6 L84 40" stroke="#d2a74e" strokeWidth="1" opacity=".7" />
      {Array.from({ length: crates }, (_, i) => (
        <rect key={i} x={46 + (i % 4) * 9} y={34 - Math.floor(i / 4) * 9} width="8" height="8" fill={i % 3 === 0 ? "#c9783a" : i % 3 === 1 ? "#6b4a2f" : "#e3f0ec"} stroke="#3f2a19" strokeWidth=".6" />
      ))}
      <text x="5" y="60" fontSize="7" textAnchor="middle" fill="#8a6420" fontFamily="Bodoni Moda, serif" fontStyle="italic">Saltmere Queen</text>
      <g className="smoke">
        <circle cx="12" cy="-32" r="7" fill="#fff" opacity=".35" />
        <circle cx="20" cy="-44" r="9" fill="#fff" opacity=".22" />
      </g>
    </g>
  );
}

export function SceneHero() {
  return (
    <svg viewBox="0 0 800 340" preserveAspectRatio="xMidYMax slice" className="hero-scene" role="img" aria-label="A jewel-like island at dusk with a palace on the hill and an old ferry at the pier">
      <rect width="800" height="340" fill="url(#g-sky)" />
      <circle cx="600" cy="150" r="40" fill="#fbe3b0" opacity=".9" />
      <g fill="#fff" opacity=".7">
        <circle cx="90" cy="40" r="1.3" /><circle cx="160" cy="70" r="1" /><circle cx="260" cy="30" r="1.4" /><circle cx="420" cy="55" r="1" /><circle cx="700" cy="40" r="1.2" />
      </g>
      <path d="M100 240 C160 170 230 140 300 125 C340 80 380 70 420 95 C470 125 530 165 570 200 C610 220 650 232 670 242 Z" fill="#2c6b4a" />
      <path d="M130 240 C190 195 250 178 310 172 C370 168 430 182 480 200 C530 218 590 232 650 242 Z" fill="#3f8a5a" />
      <g transform="translate(395 98) scale(.62)"><PlaceArt place="palace" /></g>
      <g transform="translate(480 196) scale(.5)"><PlaceArt place="hotel" /></g>
      <g transform="translate(250 196) scale(.45)"><PlaceArt place="gardens" /></g>
      <rect y="238" width="800" height="102" fill="url(#g-sea)" />
      <path d="M0 238 C120 232 240 244 360 238 C480 232 620 246 800 238 L800 248 L0 248Z" fill="#7fe0d2" opacity=".55" />
      <rect y="250" width="800" height="90" fill="url(#p-waves)" opacity=".25" />
      <rect x="600" y="240" width="90" height="5" fill="#6b4a2f" />
      <g transform="translate(700 196) scale(.8)"><Ferry /></g>
    </svg>
  );
}
