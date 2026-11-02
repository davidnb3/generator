import { clamp } from "./modulation";

/** Equal-power crossfade: as x goes 0 to 1, `a` falls and `b` rises, and the combined loudness stays level. */
export function crossfade(x: number) {
  const t = clamp(x) * Math.PI / 2;
  return { a: Math.cos(t), b: Math.sin(t) };
}

/** How the knobs map to gains. The scales were set by measuring each layer so equal knob positions sound about equally loud. */
export const SCALE = {
  cloud: 0.9,
  slow: 0.6,
  drone: 1.0,
  spectral: 1.2,
  original: 0.5, // the unprocessed sample is about twice as loud as the soundscape
  room: 2.6, // measured: a full-wet room is about 5 dB under the same sound dry at gain 1.5, so lift it to match
};

export const rmsOf = (samples: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / Math.max(1, samples.length));
};

/** RMS to a 0..1 meter position: -60 dB is empty, 0 dB is full. */
export const meterPosition = (rms: number) => clamp((20 * Math.log10(Math.max(rms, 1e-6)) + 60) / 60);
