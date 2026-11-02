/** Parameters the orb can modulate. ax/ay are the depth of the orb's X (Texture) and Y (Energy) axes. */
export const MODULATED = [
  { id: "position", label: "Position", default: 0.35, ax: 0, ay: 0 },
  { id: "size", label: "Size", default: 0.5, ax: 0.5, ay: 0 },
  { id: "density", label: "Density", default: 0.55, ax: 0, ay: 0.5 },
  { id: "spray", label: "Spray", default: 0.3, ax: 0.2, ay: 0.2 },
  { id: "pitch", label: "Pitch", default: 0.5, ax: 0, ay: 0.35 },
  { id: "filter", label: "Filter", default: 0.75, ax: 0.4, ay: 0 },
  { id: "space", label: "Space", default: 0.4, ax: 0.45, ay: 0 },
  { id: "drive", label: "Drive", default: 0.2, ax: 0, ay: 0.5 },
] as const;

/** Macro and gesture knobs that are not modulated by the orb. */
export const PLAIN = [
  { id: "cloud", label: "Cloud", default: 0.62 },
  { id: "spectral", label: "Spectral", default: 0.38 },
  { id: "random", label: "Random", default: 0.4 },
  { id: "shape", label: "Curve", default: 0.5 },
  { id: "wet", label: "Wet", default: 0.68 },
] as const;

export type ModulatedId = (typeof MODULATED)[number]["id"];
export type PlainId = (typeof PLAIN)[number]["id"];
export type NumericId = ModulatedId | PlainId | "orbX" | "orbY";

export const GESTURE_TYPES = ["riser", "drop", "both"] as const;
export type GestureType = (typeof GESTURE_TYPES)[number];
export const GESTURE_BARS = [4, 8, 16] as const;

export const BPM = 84;
