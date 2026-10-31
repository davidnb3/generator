import { createRng } from "./rng";
import { clamp } from "./modulation";

export interface SampleInfo {
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
  peaks: number[]; // 0..1, mono mixdown for display only; the buffer keeps every channel
  buffer: AudioBuffer;
  synthetic: boolean; // the built-in demo, not a user file
}

export const MAX_SAMPLE_SECONDS = 30;
export const PEAK_COUNT = 480;

/** Eight seconds of synthetic rain on tin: a soft noise bed plus random pitched droplets, in stereo. */
export function demoSample(ctx: BaseAudioContext): SampleInfo {
  const rate = ctx.sampleRate, len = Math.round(rate * 8), r = createRng(7);
  const buffer = ctx.createBuffer(2, len, rate);
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    lp += 0.04 * (r() * 2 - 1 - lp);
    const bed = lp * 0.5;
    L[i] = bed; R[i] = bed * (0.9 + 0.1 * Math.sin(i / 9000));
  }
  const drops = 8 * 38;
  for (let d = 0; d < drops; d++) {
    const start = Math.floor(r() * (len - rate * 0.2)), freq = 900 + r() * 3300, decay = 0.012 + r() * 0.05;
    const amp = 0.08 + r() * r() * 0.55, pan = r() * 2 - 1, n = Math.floor(decay * rate * 4);
    for (let i = 0; i < n && start + i < len; i++) {
      const v = Math.sin((2 * Math.PI * freq * i) / rate) * Math.exp(-i / (decay * rate)) * amp;
      L[start + i] += v * (1 - Math.max(0, pan)); R[start + i] += v * (1 + Math.min(0, pan));
    }
  }
  return { name: "Demo texture", duration: 8, sampleRate: rate, channels: 2, peaks: computePeaks(buffer), buffer, synthetic: true };
}

export function computePeaks(buffer: AudioBuffer, count = PEAK_COUNT): number[] {
  const len = buffer.length, step = Math.max(1, Math.floor(len / count)), peaks: number[] = [];
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < count; i++) {
    let m = 0;
    for (let j = i * step; j < Math.min(len, (i + 1) * step); j += 8) for (const ch of chans) m = Math.max(m, Math.abs(ch[j]));
    peaks.push(m);
  }
  const max = Math.max(...peaks) || 1;
  return peaks.map((p) => clamp(p / max));
}

export type LoadResult = { ok: true; sample: SampleInfo } | { ok: false; error: string };

/** Decodes at the file's own channel count; stereo stays stereo. */
export async function decodeSample(ctx: BaseAudioContext, file: File): Promise<LoadResult> {
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "Couldn't decode that file. Try a WAV, MP3, or OGG." };
  }
  if (buffer.duration > MAX_SAMPLE_SECONDS)
    return { ok: false, error: `That sample is ${buffer.duration.toFixed(0)} s. Trim it to ${MAX_SAMPLE_SECONDS} s or less.` };
  return {
    ok: true,
    sample: { name: file.name, duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, peaks: computePeaks(buffer), buffer, synthetic: false },
  };
}
