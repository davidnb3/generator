import { createRng } from "./rng";
import { clamp } from "./modulation";

export interface SampleInfo {
  name: string;
  duration: number;
  sampleRate: number; // 0 for the synthetic demo
  channels: number;
  peaks: number[]; // 0..1, mono mixdown for display only; the buffer keeps every channel
  buffer: AudioBuffer | null;
}

export const MAX_SAMPLE_SECONDS = 30;
export const PEAK_COUNT = 480;

export function demoSample(): SampleInfo {
  const r = createRng(7), peaks: number[] = [];
  for (let i = 0; i < PEAK_COUNT; i++) {
    const env = 0.38 + 0.3 * Math.sin(i / 37) + 0.28 * Math.sin(i / 11 + 2);
    peaks.push(clamp(Math.abs(env) * (0.35 + 0.65 * r())));
  }
  return { name: "Demo texture", duration: 8, sampleRate: 0, channels: 1, peaks, buffer: null };
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
    sample: { name: file.name, duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, peaks: computePeaks(buffer), buffer },
  };
}
