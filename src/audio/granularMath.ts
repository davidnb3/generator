import { clamp } from "./modulation";
import type { Rng } from "./rng";

/** Knob (0..1) to musical units. */
export const grainSeconds = (size: number) => 0.02 * Math.pow(20, clamp(size)); // 20 ms .. 400 ms
export const grainsPerSecond = (density: number) => 2 * Math.pow(40, clamp(density)); // 2 .. 80 per second
export const semitones = (pitch: number) => (clamp(pitch) - 0.5) * 24; // +-12 st, 0.5 is unison
export const rateOf = (st: number) => Math.pow(2, st / 12);
export const cutoffHz = (filter: number) => Math.min(20000, 300 * Math.pow(70, clamp(filter))); // 300 Hz .. 20 kHz

export const wrap = (x: number, m: number) => ((x % m) + m) % m;

export interface GrainSettings {
  position: number; // 0..1 read position (wraps)
  size: number; // 0..1
  density: number; // 0..1
  spray: number; // 0..1: position jitter, pitch spread and pan width
  pitch: number; // semitones
}

export interface GrainPlan {
  offset: number; // seconds into the (possibly reversed) buffer
  sourceSeconds: number; // how much of the buffer the grain reads
  duration: number; // how long the grain sounds, in seconds
  rate: number;
  pan: number;
  gain: number;
}

/** Plans one grain. The RNG call order is fixed so a seed always yields the same grains. */
export function planGrain(s: GrainSettings, bufferSeconds: number, rng: Rng, reversed = false): GrainPlan {
  const duration = grainSeconds(s.size);
  const jitterR = rng(), pitchR = rng(), panR = rng();
  const st = s.pitch + (pitchR * 2 - 1) * s.spray * 1.2; // up to +-120 cents at full spray
  const rate = rateOf(st);
  const sourceSeconds = Math.min(bufferSeconds, duration * rate);
  const centre = wrap(s.position, 1) * bufferSeconds + (jitterR * 2 - 1) * s.spray * 0.3 * bufferSeconds;
  let offset = clamp(wrap(centre, bufferSeconds), 0, Math.max(0, bufferSeconds - sourceSeconds));
  if (reversed) offset = Math.max(0, bufferSeconds - offset - sourceSeconds);
  const overlap = grainsPerSecond(s.density) * duration;
  return { offset, sourceSeconds, duration: sourceSeconds / rate, rate, pan: (panR * 2 - 1) * (0.3 + 0.7 * s.spray), gain: 0.9 / Math.sqrt(Math.max(1, overlap)) };
}

/** Seconds until the next grain, with +-40% timing jitter around the mean. */
export const nextInterval = (density: number, rng: Rng) => (1 / grainsPerSecond(density)) * (0.6 + 0.8 * rng());

/** Hann window, 0..1, for grain envelopes. */
export function hann(points = 32): Float32Array {
  return Float32Array.from({ length: points }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (points - 1)));
}
