import { useEffect, useId, useRef, useState } from "react";
import type { GameView } from "../../shared/game";
import { SIGNALS, type SignalKey } from "../../shared/protocol";
import { sendChat, sendSignal, useStore } from "./net";
import { sfx } from "./sound";
import { Icon, MuteButton } from "./ui";
import { joinVoice, leaveVoice, useVoice, voiceSupported } from "./voice";

export function SignalBar({ compact }: { compact?: boolean }) {
  const [cool, setCool] = useState(false);
  const send = (k: SignalKey) => {
    if (cool) return;
    sendSignal(k);
    sfx.click();
    setCool(true);
    setTimeout(() => setCool(false), 900);
  };
  return (
    <div className={`signals ${compact ? "compact" : ""}`} role="group" aria-label="Quick signals">
      {SIGNALS.map((s) => (
        <button key={s.key} className={`sig sig-${s.key}`} onClick={() => send(s.key)} disabled={cool}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function VoicePanel() {
  const vu = useVoice();
  if (!voiceSupported) return <p className="muted small">Voice chat isn't supported in this browser. Signals and chat work everywhere.</p>;
  return (
    <div className="voice-panel">
      {!vu.joined ? (
        <button className="btn brass" onClick={() => joinVoice()} disabled={vu.joining}>
          <Icon name="headset" /> {vu.joining ? "Connecting…" : "Join voice chat"}
        </button>
      ) : (
        <div className="row gap">
          <MuteButton />
          <span className="small">{!vu.hasMic ? "Listening only" : vu.muted ? "You're muted" : "You're live"}</span>
          <button className="btn ghost small" onClick={() => leaveVoice()}>Leave voice</button>
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ v }: { v: GameView }) {
  const { chat, signals } = useStore();
  const [text, setText] = useState("");
  const inputId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const name = (id: string) => (id === v.you ? "You" : v.players.find((p) => p.id === id)?.name ?? "Someone");
  const items = [
    ...chat.map((m) => ({ at: m.at, key: m.id, el: m.from ? <p className="msg"><b>{name(m.from)}</b> {m.text}</p> : <p className="msg sys">{m.text}</p> })),
    ...signals.map((s) => ({ at: s.at, key: `s${s.at}${s.from}`, el: <p className="msg sigmsg"><b>{name(s.from)}</b> <span>{SIGNALS.find((x) => x.key === s.key)?.label}</span></p> })),
  ].sort((a, b) => a.at - b.at).slice(-80);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [items.length]);

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef} aria-live="polite">
        {items.length ? items.map((i) => <div key={i.key}>{i.el}</div>) : <p className="muted small">Say hello. Messages and signals appear here.</p>}
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) sendChat(text);
          setText("");
        }}
      >
        <label htmlFor={inputId} className="sr">Message</label>
        <input id={inputId} className="chat-input" value={text} maxLength={280} onChange={(e) => setText(e.target.value)} placeholder="Message the table" autoComplete="off" />
        <button className="btn brass small" type="submit" disabled={!text.trim()}>Send</button>
      </form>
    </div>
  );
}

export function ShipLog({ v }: { v: GameView }) {
  return (
    <ol className="ship-log">
      {v.log.slice(-6).reverse().map((l) => (
        <li key={l.n} className={`log-${l.kind}`}>{l.text}</li>
      ))}
    </ol>
  );
}

export function CommsPanel({ v }: { v: GameView }) {
  return (
    <div className="comms">
      <VoicePanel />
      <SignalBar />
      <ChatPanel v={v} />
    </div>
  );
}
