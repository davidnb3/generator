import { MODULATED, type ModulatedId } from "./params";

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type Boost = Partial<Record<ModulatedId | "cloud" | "spectral", number>>;

/** Gesture phases: rise 0..1 while building, drop 1..0 after the hit. */
export function gestureBoost(rise: number, drop: number): Boost {
  return {
    density: rise * 0.45 - drop * 0.55,
    size: -rise * 0.35 + drop * 0.3,
    pitch: rise * 0.4 - drop * 0.5,
    filter: rise * 0.5 - drop * 0.6,
    space: rise * 0.25 + drop * 0.45,
    drive: rise * 0.3 - drop * 0.15,
    spray: rise * 0.3,
    cloud: rise * 0.25 - drop * 0.2,
    spectral: rise * 0.3 + drop * 0.2,
  };
}

/** Value heard: base + orb X/Y contribution + gesture boost, clamped to 0..1. Up on the orb is +Y. */
export function effective(base: number, ax: number, ay: number, orbX: number, orbY: number, boost = 0) {
  return clamp(base + orbX * ax + -orbY * ay + boost);
}

export const depthOf = (id: string) => MODULATED.find((m) => m.id === id);
