import { type ReactNode, useEffect, useState } from "react";
import { useStore } from "./net";
import { toggleMute, useVoice, voiceSupported } from "./voice";

export function Icon({ name, size = 20 }: { name: "mic" | "micOff" | "chat" | "sound" | "soundOff" | "close" | "check" | "anchor" | "crown" | "copy" | "help" | "bot" | "plus" | "minus" | "wave" | "headset" | "trade" | "sword"; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "mic":
      return <svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
    case "micOff":
      return <svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16" /></svg>;
    case "headset":
      return <svg {...p}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></svg>;
    case "chat":
      return <svg {...p}><path d="M4 5h16v10H9l-5 4z" /></svg>;
    case "sound":
      return <svg {...p}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>;
    case "soundOff":
      return <svg {...p}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>;
    case "close":
      return <svg {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case "check":
      return <svg {...p}><path d="M5 12l5 5 9-10" /></svg>;
    case "anchor":
      return <svg {...p}><circle cx="12" cy="5" r="2" /><path d="M12 7v14M8 11h8M4 14a8 8 0 0 0 16 0" /></svg>;
    case "crown":
      return <svg {...p}><path d="M3 18h18L19 7l-4 4-3-6-3 6-4-4z" /></svg>;
    case "copy":
      return <svg {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></svg>;
    case "help":
      return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" /></svg>;
    case "bot":
      return <svg {...p}><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01" /></svg>;
    case "plus":
      return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case "minus":
      return <svg {...p}><path d="M5 12h14" /></svg>;
    case "trade":
      return <svg {...p}><path d="M4 8h13l-3-3M20 16H7l3 3" /></svg>;
    case "sword":
      return <svg {...p}><path d="M14.5 3.5L20 3l-.5 5.5L9 19l-4-4zM6 14l4 4M4 20l2.5-2.5" /></svg>;
    case "wave":
      return <svg {...p}><path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0" /></svg>;
  }
}

export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className={`sheet ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Seconds left in the current phase, ticking. */
export function useCountdown(endsAt: number | null): number {
  const { clockOffset } = useStore();
  const [, force] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - (Date.now() + clockOffset)) / 1000));
}

export function Dial({ endsAt, total }: { endsAt: number | null; total: number }) {
  const left = useCountdown(endsAt);
  const frac = total ? Math.min(1, left / total) : 0;
  const r = 20;
  const c = 2 * Math.PI * r;
  const low = left > 0 && left <= 10;
  return (
    <div className={`dial ${low ? "low" : ""}`} aria-label={`${left} seconds left`}>
      <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="#0b2a33" stroke="url(#g-brass)" strokeWidth="2.5" />
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(210,167,78,.18)" strokeWidth="3" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={low ? "#e98a93" : "#d2a74e"} strokeWidth="3" strokeDasharray={`${c * frac} ${c}`} transform="rotate(-90 24 24)" strokeLinecap="round" />
      </svg>
      <span>{endsAt ? left : ""}</span>
    </div>
  );
}

export function MuteButton({ big }: { big?: boolean }) {
  const v = useVoice();
  if (!voiceSupported) return null;
  const label = !v.joined ? "Join voice chat" : !v.hasMic ? "Listening only" : v.muted ? "Unmute microphone" : "Mute microphone";
  const cls = !v.joined ? "off" : v.muted ? "muted" : "live";
  return (
    <button className={`mute-btn ${cls} ${big ? "big" : ""}`} onClick={() => toggleMute()} aria-label={label} title={label} disabled={v.joining}>
      <Icon name={!v.joined ? "headset" : v.muted ? "micOff" : "mic"} size={big ? 26 : 22} />
      {!v.joined && <span className="mute-hint">Voice</span>}
    </button>
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`}><Icon name="minus" size={16} /></button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}><Icon name="plus" size={16} /></button>
    </div>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
