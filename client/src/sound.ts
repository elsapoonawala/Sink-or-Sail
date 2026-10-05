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

// Everything plays through one soft chain: low overall volume, a gentle low-pass so nothing
// is shrill, and a compressor so several sounds at once never get loud.
let bus: AudioNode | null = null;
const VOLUME = 0.55;

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

function out(c: AudioContext): AudioNode {
  if (bus) return bus;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  lp.Q.value = 0.5;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -28;
  comp.ratio.value = 6;
  const g = c.createGain();
  g.gain.value = VOLUME;
  lp.connect(comp).connect(g).connect(c.destination);
  bus = lp;
  return bus;
}

/** The same sound never fires more than once in a short while, so nothing rattles. */
const lastAt = new Map<string, number>();
function calm(key: string, gapMs: number) {
  const now = performance.now();
  if (now - (lastAt.get(key) ?? -1e9) < gapMs) return false;
  lastAt.set(key, now);
  return true;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.05, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  // A soft attack instead of a click.
  g.gain.linearRampToValueAtTime(vol, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out(c));
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, from: number, to: number, kind: BiquadFilterType = "lowpass") {
  const c = ac();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = kind;
  f.frequency.setValueAtTime(from, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + dur * 0.4);
  g.gain.linearRampToValueAtTime(0, c.currentTime + dur);
  src.connect(f).connect(g).connect(out(c));
  src.start();
}

/** Soft, rounded sounds: sine and triangle only, nothing above a gentle chime. */
export const sfx = {
  click: () => calm("click", 80) && tone(660, 0.08, "sine", 0.03),
  pearl: () => {
    if (!calm("pearl", 150)) return;
    tone(988, 0.3, "sine", 0.035);
    tone(1319, 0.35, "sine", 0.025, 0.08);
  },
  deal: () => calm("deal", 300) && noise(0.25, 0.025, 1400, 600),
  thud: () => {
    if (!calm("thud", 200)) return;
    tone(110, 0.3, "sine", 0.07);
  },
  flip: () => {
    if (!calm("flip", 200)) return;
    tone(523, 0.25, "sine", 0.03);
    tone(784, 0.35, "sine", 0.03, 0.08);
  },
  /** A slow wash of water. */
  flood: () => calm("flood", 1500) && noise(2.2, 0.05, 250, 900),
  /** A deep, slow rumble and a swell of water. */
  monster: () => {
    if (!calm("monster", 1500)) return;
    tone(65, 1.2, "sine", 0.09);
    tone(82, 1.0, "sine", 0.05, 0.15);
    noise(1.2, 0.05, 300, 800);
  },
  trade: () => {
    if (!calm("trade", 300)) return;
    tone(659, 0.2, "sine", 0.035);
    tone(880, 0.25, "sine", 0.03, 0.1);
  },
  /** Something happened to you: two low, round notes. */
  alert: () => {
    if (!calm("alert", 800)) return;
    tone(330, 0.35, "sine", 0.05);
    tone(262, 0.45, "sine", 0.045, 0.18);
  },
  horn: () => {
    tone(110, 1.6, "triangle", 0.05);
    tone(165, 1.6, "sine", 0.03);
  },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.6, "sine", 0.045, i * 0.16)),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.7, "sine", 0.04, i * 0.22)),
  tick: () => calm("tick", 400) && tone(880, 0.05, "sine", 0.015),
  /** A different sound for each thing you pick up. */
  pickup: (item?: string) => {
    if (!calm("pickup", 150)) return;
    switch (item) {
      case "fuel": // a heavy drum: a low, muffled knock
        tone(140, 0.25, "sine", 0.07);
        noise(0.3, 0.025, 500, 160);
        break;
      case "medicine": // glass bottles, softly
        tone(1047, 0.22, "sine", 0.03);
        tone(1319, 0.25, "sine", 0.025, 0.08);
        break;
      case "tools": // a wooden clunk
        tone(330, 0.15, "triangle", 0.04);
        tone(494, 0.2, "sine", 0.03, 0.04);
        break;
      case "diamond": // a gentle sparkle
        [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.4, "sine", 0.025, i * 0.07));
        break;
      case "cutlass": // a soft swish
        noise(0.35, 0.03, 800, 2200, "bandpass");
        tone(587, 0.3, "sine", 0.02, 0.1);
        break;
      case "compass": // a soft chime
        tone(660, 0.5, "sine", 0.035);
        tone(990, 0.5, "sine", 0.025, 0.1);
        break;
      default: // pearls
        tone(988, 0.3, "sine", 0.035);
        tone(1319, 0.35, "sine", 0.025, 0.08);
    }
  },
  /** Your crates going into the hold: a soft thump and a gentle "done". */
  loaded: () => {
    if (!calm("loaded", 300)) return;
    tone(110, 0.3, "sine", 0.07);
    tone(523, 0.3, "sine", 0.035, 0.15);
    tone(784, 0.4, "sine", 0.035, 0.27);
  },
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
  g.gain.value = 0.035;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.12;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.02;
  lfo.connect(lfoGain).connect(g.gain);
  src.connect(g).connect(out(c));
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
