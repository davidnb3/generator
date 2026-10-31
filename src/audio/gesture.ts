import { createRng } from "./rng";
import { clamp, lerp } from "./modulation";
import type { GestureType } from "./params";

export const easeIn = (t: number) => t * t;
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export const GESTURE_CURVES = [
  { id: "density", m: 1, inv: false, rest: 0.1 },
  { id: "size", m: 0.6, inv: true, rest: 0.6 },
  { id: "filter", m: 0.8, inv: false, rest: 0.15 },
  { id: "space", m: 0.5, inv: false, rest: 0.5 },
] as const;
export type GestureCurve = (typeof GESTURE_CURVES)[number];

const riserVal = (c: GestureCurve, u: number, e: number) => {
  const x = Math.pow(u, e * c.m);
  return c.inv ? 1 - x : x;
};

/** Shape of one gesture curve at position u (0..1) for the given type; shape k (0..1) bends the exponent. */
export function curveValue(c: GestureCurve, u: number, type: GestureType, k: number) {
  const e = lerp(0.6, 2.6, k);
  if (type === "riser") return riserVal(c, u, e);
  if (type === "drop") {
    if (c.id === "size") return Math.pow(u, e * 0.5) * c.rest;
    if (c.id === "space") return Math.pow(1 - u, 0.7);
    return Math.pow(1 - u, e * c.m);
  }
  if (u < 0.75) return riserVal(c, u / 0.75, e);
  const w = (u - 0.75) / 0.25, end = riserVal(c, 1, e);
  return lerp(end, c.rest, 1 - Math.pow(1 - w, 3));
}

export interface GesturePhase { rise: number; drop: number; t: number; impact: boolean }
export const RISER_SHARE = 0.75;

/** Phase of a running gesture at progress t (0..1). `impact` is true once the hit has been reached. */
export function gesturePhase(type: GestureType, t: number): GesturePhase {
  const p = clamp(t);
  if (type === "riser") return { rise: easeIn(p), drop: 0, t: p, impact: false };
  if (type === "drop") return { rise: 0, drop: 1 - easeOut(p), t: p, impact: true };
  if (p < RISER_SHARE) return { rise: easeIn(p / RISER_SHARE), drop: 0, t: p, impact: false };
  return { rise: 0, drop: 1 - easeOut((p - RISER_SHARE) / (1 - RISER_SHARE)), t: p, impact: true };
}

/** Seeded jitter for the four gesture curves (64 points each), so the same seed always shows and plays the same curves. */
export function gestureNoise(seed: number, points = 64): number[][] {
  return GESTURE_CURVES.map((_, i) => {
    const r = createRng(seed + i * 977);
    return Array.from({ length: points }, () => r() * 2 - 1);
  });
}
