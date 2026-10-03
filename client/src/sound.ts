// Small synthesized sound effects and an optional sea ambience. No audio files needed.
let ctx: AudioContext | null = null;
let enabled = (() => {
  try {
    return localStorage.getItem("lastferry:sound") !== "off";
  } catch {
    return true;
  }
})();
let sea: { stop: () => void } | null = null;

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.08, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, from: number, to: number) {
  const c = ac();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(from, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + dur * 0.4);
  g.gain.linearRampToValueAtTime(0, c.currentTime + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

export const sfx = {
  click: () => tone(880, 0.06, "triangle", 0.05),
  pearl: () => {
    tone(1318, 0.25, "sine", 0.06);
    tone(1760, 0.3, "sine", 0.05, 0.07);
  },
  deal: () => {
    noise(0.12, 0.05, 4000, 1500);
  },
  thud: () => {
    tone(110, 0.25, "sine", 0.14);
    noise(0.1, 0.05, 900, 200);
  },
  flip: () => {
    tone(660, 0.05, "square", 0.03);
    tone(990, 0.08, "triangle", 0.04, 0.05);
  },
  flood: () => noise(2.2, 0.12, 300, 1600),
  trade: () => {
    tone(784, 0.12, "triangle", 0.06);
    tone(1046, 0.18, "triangle", 0.06, 0.1);
  },
  alert: () => {
    tone(392, 0.25, "sawtooth", 0.04);
    tone(370, 0.35, "sawtooth", 0.04, 0.2);
  },
  horn: () => {
    tone(110, 1.6, "sawtooth", 0.07);
    tone(165, 1.6, "sawtooth", 0.04);
  },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, "triangle", 0.07, i * 0.14)),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.6, "triangle", 0.06, i * 0.2)),
  tick: () => tone(1200, 0.03, "square", 0.02),
};

export function startSea() {
  const c = ac();
  if (!c || sea) return;
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = c.createGain();
  g.gain.value = 0.05;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.12;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.035;
  lfo.connect(lfoGain).connect(g.gain);
  src.connect(g).connect(c.destination);
  src.start();
  lfo.start();
  sea = { stop: () => { src.stop(); lfo.stop(); } };
}

export function soundOn() {
  return enabled;
}

export function setSound(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem("lastferry:sound", on ? "on" : "off");
  } catch {
    /* ignore */
  }
  if (!on) {
    sea?.stop();
    sea = null;
  } else startSea();
}
