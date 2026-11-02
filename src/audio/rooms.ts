import { createRng } from "./rng";

/** Built-in rooms are generated, not shipped as files: decaying noise with a darkening tail, early reflections, and optional metallic ring. */
export interface RoomSpec { id: string; label: string; rt60: number; tilt: number; pre: number; early: number; ring: boolean }

export const ROOMS = [
  { id: "small", label: "Small room", rt60: 0.45, tilt: 0.5, pre: 0.003, early: 6, ring: false },
  { id: "plate", label: "Plate", rt60: 1.8, tilt: 0.2, pre: 0, early: 0, ring: false },
  { id: "hall", label: "Hall", rt60: 2.4, tilt: 0.7, pre: 0.02, early: 8, ring: false },
  { id: "cathedral", label: "Cathedral", rt60: 5.5, tilt: 0.85, pre: 0.035, early: 10, ring: false },
  { id: "cave", label: "Cave", rt60: 4.2, tilt: 0.93, pre: 0.05, early: 5, ring: false },
  { id: "tank", label: "Metal tank", rt60: 3.2, tilt: 0.35, pre: 0, early: 0, ring: true },
] as const satisfies readonly RoomSpec[];

export type RoomId = (typeof ROOMS)[number]["id"] | "sample";
export const ROOM_CHOICES: { id: RoomId; label: string }[] = [...ROOMS.map((r) => ({ id: r.id, label: r.label })), { id: "sample", label: "Your sample" }];

export const MAX_IR_SECONDS = 6;

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Stereo impulse response for a built-in room. Deterministic. */
export function generateIr(room: RoomSpec, sampleRate: number): Float32Array[] {
  const len = Math.floor(Math.min(MAX_IR_SECONDS, room.rt60 * 1.3) * sampleRate), pre = Math.floor(room.pre * sampleRate);
  return [0, 1].map((ch) => {
    const r = createRng(hash(room.id) + ch * 7919), out = new Float32Array(len);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sampleRate, env = Math.exp((-6.9078 * t) / room.rt60);
      const k = Math.max(0.04, 1 - room.tilt * Math.min(1, t / (room.rt60 * 0.6))); // one-pole coefficient: the tail darkens
      lp += k * (r() * 2 - 1 - lp);
      out[i] = lp * env;
    }
    for (let e = 0; e < room.early; e++) {
      const at = pre + Math.floor((0.005 + r() * 0.055) * sampleRate);
      if (at < len) out[at] += (r() < 0.5 ? -1 : 1) * (0.9 - e * 0.07);
    }
    if (room.ring) {
      for (const [d, g] of [[Math.round(sampleRate * 0.0073), 0.55], [Math.round(sampleRate * 0.0111), 0.5]] as const)
        for (let i = d; i < len; i++) out[i] += g * out[i - d];
    }
    const fade = Math.floor(len * 0.05);
    for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
    return out;
  });
}

/** Turns (part of) a sample into an impulse response: capped length, DC removed, soft edges. Mono is decorrelated into stereo. */
export function sampleIr(channels: Float32Array[], sampleRate: number, maxSeconds = 4): Float32Array[] {
  const n = Math.max(1, Math.min(channels[0].length, Math.floor(maxSeconds * sampleRate)));
  const shift = Math.round(sampleRate * 0.0075);
  const src = channels.length > 1 ? [channels[0], channels[1]] : [channels[0], channels[0]];
  return src.map((data, c) => {
    const out = new Float32Array(n), off = channels.length === 1 && c === 1 ? shift : 0;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += data[Math.min(data.length - 1, i + off)] ?? 0;
    mean /= n;
    const fadeIn = Math.max(1, Math.floor(sampleRate * 0.005)), fadeStart = Math.floor(n * 0.7);
    for (let i = 0; i < n; i++) {
      const w = Math.min(1, i / fadeIn) * (i < fadeStart ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (i - fadeStart)) / (n - fadeStart)));
      out[i] = ((data[Math.min(data.length - 1, i + off)] ?? 0) - mean) * w;
    }
    return out;
  });
}

/** Start (in samples) of the loudest ~0.5 s of a sample, snapped to its onset. Used for the gesture hit. */
export function findImpactStart(data: Float32Array, sampleRate: number, windowSeconds = 0.5): number {
  const hop = Math.max(1, Math.floor(sampleRate * 0.025)), win = Math.max(1, Math.floor(windowSeconds / 0.025));
  const energy: number[] = [];
  for (let i = 0; i + hop <= data.length; i += hop) { let e = 0; for (let j = i; j < i + hop; j++) e += data[j] * data[j]; energy.push(e); }
  if (energy.length === 0) return 0;
  let best = 0, bestSum = -1, sum = 0;
  for (let i = 0; i < energy.length; i++) {
    sum += energy[i];
    if (i >= win) sum -= energy[i - win];
    if (i >= win - 1 && sum > bestSum) { bestSum = sum; best = i - win + 1; }
  }
  if (bestSum < 0) best = 0;
  const from = best * hop, to = Math.min(data.length, from + win * hop); // the onset is the first strong sample inside the loudest window
  let peak = 0;
  for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(data[i]));
  for (let i = from; i < to; i++) if (Math.abs(data[i]) >= peak * 0.3) return Math.max(0, i - Math.floor(sampleRate * 0.002));
  return best * hop;
}
