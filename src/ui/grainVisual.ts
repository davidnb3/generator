import type { GrainEvent } from "../audio/GranularCloud";
import { clamp } from "../audio/modulation";

/** How a real grain is drawn in the orb. Pure, so the mapping is tested. */

export const BARS = 240; // bars on the sample ring

/** Where on the sample (0..1, in the original direction) a grain reads from: the middle of what it plays. */
export function readFraction(e: GrainEvent, bufferSeconds: number): number {
  const mid = (e.plan.offset + e.plan.sourceSeconds / 2) / bufferSeconds;
  const f = e.reversed ? 1 - mid : mid; // a reversed grain's offset counts from the end
  return ((f % 1) + 1) % 1;
}

/** Half of what the grain plays, as a share of the sample: the grain covers readFraction ± this. Capped so a very long grain stays an arc, not a ring. */
export function grainHalfSpan(e: GrainEvent, bufferSeconds: number): number {
  return clamp(e.plan.sourceSeconds / 2 / bufferSeconds, 0, 0.3);
}

export type GrainTone = "up" | "down" | "plain" | "drone";

/** Octave-up grains are amber, grains pitched well down are violet, the drone's are pale violet. */
export function grainTone(e: GrainEvent): GrainTone {
  if (e.voice === "drone") return "drone";
  return e.plan.rate >= 1.7 ? "up" : e.plan.rate <= 0.7 ? "down" : "plain";
}

/** Dot radius: longer grains are bigger (10 ms to 400 ms spans 1.2 to 3.6); the drone's very long grains are the biggest. */
export function grainRadius(e: GrainEvent): number {
  if (e.voice === "drone") return 4.4;
  const u = clamp(Math.log(e.plan.duration / 0.01) / Math.log(0.4 / 0.01));
  return 1.2 + 2.4 * u;
}

/** How long the dot is shown: the grain's real length, but never so short it can't be seen. */
export const visualLife = (e: GrainEvent) => clamp(e.plan.duration, 0.35, 3);

/** Quieter grains (many overlapping) are drawn fainter. */
export const grainAlpha = (e: GrainEvent) => 0.4 + 0.6 * clamp(e.plan.gain * 3);
