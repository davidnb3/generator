import { renderOffline } from "@audiorective/core";
import { Voices } from "../Voices";
import type { Take } from "./take";

/** Audio rendered before the take starts, so grains that began before REC was pressed still sound. */
export const PREROLL = 0.5;

export interface Rendered { channels: Float32Array[]; sampleRate: number }

const wrap = (x: number, m: number) => ((x % m) + m) % m;

/**
 * Re-renders a take offline: the same sound path, the logged grains replayed exactly, and the logged control
 * values replayed as automation. Grains are exact; the slow player's phase is estimated, so that layer is close but
 * not sample-identical to the live capture.
 */
export async function renderTake(take: Take, opts: { sampleRate?: number; tail?: number } = {}): Promise<Rendered> {
  const sampleRate = opts.sampleRate ?? take.sampleRate, tail = opts.tail ?? 1;
  const buffer = await renderOffline({ seconds: PREROLL + take.duration + tail, channels: 2, sampleRate }, (ctx) => {
    const voices = new Voices(ctx, take.seed);
    voices.output.connect(ctx.destination);

    const rate0 = take.control.find((e) => e.key === "rate")?.value ?? 0.25;
    voices.setBuffer(take.sample.buffer, wrap(take.playerPhase - PREROLL * rate0, take.sample.buffer.duration), 0);

    const seen = new Set<string>();
    for (const e of take.control) {
      const param = voices.control[e.key];
      if (!seen.has(e.key)) { seen.add(e.key); param.setValueAtTime(e.value, 0); }
      param.setTargetAtTime(e.value, PREROLL + e.t, e.tc);
    }
    for (const g of take.grains) {
      const when = PREROLL + (g.when - take.t0);
      if (when >= 0) voices.cloud.playGrain(g.plan, when, g.reversed);
    }
  });
  const from = Math.round(PREROLL * sampleRate), to = from + Math.round((take.duration + tail) * sampleRate);
  return { channels: [0, 1].map((c) => buffer.getChannelData(c).slice(from, to)), sampleRate };
}
