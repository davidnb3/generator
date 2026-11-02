import { renderOffline } from "@audiorective/core";
import { Voices } from "../Voices";
import type { Take } from "./take";

/** Audio rendered before the take starts, so grains that began before REC was pressed still sound. */
export const PREROLL = 3; // covers the longest grains (the drone's last 2.6 s) and room tails that began before REC

export interface Rendered { channels: Float32Array[]; sampleRate: number }

const wrap = (x: number, m: number) => ((x % m) + m) % m;

/**
 * Re-renders a take offline: the same sound path, the logged grains replayed exactly, and the logged control
 * values replayed as automation. Grains are exact; the slow player's phase is estimated, so that layer is close but
 * not sample-identical to the live capture.
 */
export async function renderTake(take: Take, opts: { sampleRate?: number; tail?: number } = {}): Promise<Rendered> {
  const sampleRate = opts.sampleRate ?? take.sampleRate, tail = opts.tail ?? 3;
  // The engine starts sources on render-quantum boundaries (128 frames) and the recorder starts on one too, so a
  // pre-roll of whole quanta keeps the render's grid in step with the live one. A fractional quantum shifted some
  // sources by a whole quantum or two.
  const preroll = Math.ceil((PREROLL * sampleRate) / 128) * 128 / sampleRate;
  const buffer = await renderOffline({ seconds: preroll + take.duration + tail, channels: 2, sampleRate }, (ctx) => {
    const voices = new Voices(ctx, take.seed);
    voices.output.connect(ctx.destination);

    const rate0 = take.control.find((e) => e.key === "rate")?.value ?? 0.25;
    const dur = take.sample.buffer.duration;
    voices.setBuffer(take.sample.buffer, {
      when: 0, slowReversed: take.slowReversed,
      slowOffset: wrap(take.playerPhase - preroll * rate0, dur), originalOffset: wrap(take.originalPhase - preroll, dur),
    });
    voices.setRoom(take.room, take.sample.buffer);

    const seen = new Set<string>();
    for (const e of take.control) {
      const param = voices.control[e.key];
      if (!seen.has(e.key)) { seen.add(e.key); param.setValueAtTime(e.value, 0); }
      param.setTargetAtTime(e.value, preroll + e.t, e.tc);
    }
    for (const h of take.hits) {
      const when = preroll + (h.when - take.t0);
      if (when >= 0) voices.hit.replay({ ...h, when });
    }
    for (const g of take.grains) {
      const when = preroll + (g.when - take.t0);
      if (when >= 0) (g.voice === "drone" ? voices.drone : voices.cloud).playGrain(g.plan, when, g.reversed);
    }
  });
  const from = Math.round(preroll * sampleRate), to = from + Math.round((take.duration + tail) * sampleRate);
  return { channels: [0, 1].map((c) => buffer.getChannelData(c).slice(from, to)), sampleRate };
}
