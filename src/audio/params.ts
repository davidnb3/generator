/** Parameters the orb can modulate. ax/ay are the depth of the orb's X (Texture) and Y (Energy) axes. */
export const MODULATED = [
  { id: "position", label: "Position", default: 0, ax: 0, ay: 0 },
  { id: "size", label: "Size", default: 0.37, ax: 0.35, ay: 0 },
  { id: "density", label: "Density", default: 0.51, ax: 0, ay: 0.35 },
  { id: "spray", label: "Spray", default: 0.3, ax: 0.2, ay: 0.2 },
  { id: "pitch", label: "Pitch", default: 0.5, ax: 0, ay: 0.35 },
  { id: "filter", label: "Filter", default: 0.845, ax: 0.3, ay: 0 },
  { id: "space", label: "Space", default: 0.4, ax: 0.45, ay: 0 },
  { id: "drive", label: "Drive", default: 0.2, ax: 0, ay: 0.5 },
] as const;

/** Layer levels, gesture knobs, mix and the performance amounts. The orb does not modulate these. */
export const PLAIN = [
  { id: "cloud", label: "Cloud", default: 0.62 },
  { id: "slow", label: "Slow", default: 0.5 },
  { id: "drone", label: "Drone", default: 0.5 },
  { id: "spectral", label: "Spectral", default: 0.38 },
  { id: "random", label: "Random", default: 0.4 },
  { id: "shape", label: "Curve", default: 0.5 },
  { id: "wet", label: "Dry wet", default: 1 },
  { id: "scatterAmt", label: "Scatter", default: 0.5 },
  { id: "octaveAmt", label: "Octave", default: 0.5 },
  { id: "stutterAmt", label: "Stutter", default: 0.5 },
] as const;

export type ModulatedId = (typeof MODULATED)[number]["id"];
export type PlainId = (typeof PLAIN)[number]["id"];
export type NumericId = ModulatedId | PlainId | "orbX" | "orbY";

export const GESTURE_TYPES = ["riser", "drop", "both"] as const;
export type GestureType = (typeof GESTURE_TYPES)[number];
export const GESTURE_BARS = [4, 8, 16] as const;

export const BPM = 84;
