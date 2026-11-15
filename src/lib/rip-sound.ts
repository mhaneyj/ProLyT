// Pack-opening sound, synthesized in the browser (no audio files). Every call is safe to make with no audio support,
// and nothing plays until the person has touched the page (browsers require it). Rarer pulls get a bigger sound.

type Rarity = "base" | "chrome" | "gold" | "black";

let ctx: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem("prolyt-sound") === "off"; } catch { /* storage blocked */ }

function ac() {
  try {
    if (muted || typeof window === "undefined") return null;
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx ??= new C();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

export const soundOn = () => !muted;
export function setSound(on: boolean) {
  muted = !on;
  try { localStorage.setItem("prolyt-sound", on ? "on" : "off"); } catch { /* storage blocked */ }
}

function tone(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, gain: number, to?: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at); o.stop(at + dur + 0.05);
}

function noise(c: AudioContext, at: number, dur: number, gain: number, from: number, to: number) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.9;
  f.frequency.setValueAtTime(from, at); f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.2); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(f).connect(g).connect(c.destination);
  s.start(at); s.stop(at + dur + 0.05);
}

/** A tiny paper-rip tick while the strip is dragged. progress is 0..1. */
export function tearTick(progress: number) {
  const c = ac(); if (!c) return;
  noise(c, c.currentTime, 0.05, 0.16, 2500 + progress * 3000, 6000);
}

/** The pack fully tears open. */
export function tearOpen() {
  const c = ac(); if (!c) return;
  const t = c.currentTime;
  noise(c, t, 0.32, 0.4, 1800, 7500);
  tone(c, 140, t, 0.2, "triangle", 0.18, 60);
}

/** The card slides up out of the pack. */
export function rise() {
  const c = ac(); if (!c) return;
  const t = c.currentTime;
  noise(c, t, 0.6, 0.12, 400, 2200);
}

/** The face-down card lands. Rarer cards get a low hum that builds suspense. */
export function suspense(r: Rarity) {
  const c = ac(); if (!c) return;
  const t = c.currentTime;
  tone(c, 90, t, 0.18, "sine", 0.35, 50);
  if (r === "base") return;
  const dur = r === "chrome" ? 1.1 : 1.8;
  tone(c, r === "black" ? 55 : 82, t + 0.05, dur, "sawtooth", r === "chrome" ? 0.05 : 0.08, r === "black" ? 110 : 164);
}

/** The reveal. Bigger for rarer cards. */
export function reveal(r: Rarity) {
  const c = ac(); if (!c) return;
  const t = c.currentTime;
  noise(c, t, 0.25, 0.25, 3000, 900);
  if (r === "base") { tone(c, 660, t + 0.05, 0.35, "sine", 0.22); return; }
  if (r === "chrome") {
    [784, 988, 1319, 1568].forEach((f, i) => tone(c, f, t + 0.04 + i * 0.07, 0.5, "triangle", 0.14));
    return;
  }
  if (r === "gold") {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, f, t + 0.04 + i * 0.08, 0.9, "triangle", 0.17));
    tone(c, 130, t, 0.7, "sine", 0.35, 65);
    for (let i = 0; i < 6; i++) tone(c, 2200 + i * 380, t + 0.35 + i * 0.06, 0.25, "sine", 0.06);
    return;
  }
  // black chrome: a drop, then a bright shimmer
  tone(c, 70, t, 1.2, "sine", 0.55, 32);
  noise(c, t, 0.8, 0.3, 200, 5000);
  [392, 466, 587, 784, 988, 1175].forEach((f, i) => tone(c, f, t + 0.12 + i * 0.07, 1.2, "triangle", 0.14));
  for (let i = 0; i < 9; i++) tone(c, 1800 + i * 310, t + 0.5 + i * 0.05, 0.3, "sine", 0.05);
}
