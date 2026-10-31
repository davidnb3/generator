import type { NumericId } from "../audio/params";

/** One MIDI control mapped to one instrument control. */
export interface Binding {
  cc: number;
  channel: number; // 0..15
  mode: "relative" | "absolute";
  target: NumericId;
}

/** Push encoders send CC 1..63 for clockwise ticks and 127..65 for counter-clockwise. */
export function decodeRelative(value: number): number {
  if (value === 0 || value === 64) return 0;
  return value < 64 ? value : value - 128;
}

/** Normalized change for one message: a fraction of the control's range to add (relative), or a 0..1 position (absolute). */
export function decodeMessage(b: Binding, value: number): { kind: "nudge"; amount: number } | { kind: "set"; position: number } {
  if (b.mode === "relative") return { kind: "nudge", amount: decodeRelative(value) / 100 };
  return { kind: "set", position: value / 127 };
}

/** Push 1, 2 and 3 in user mode send the eight encoders as CC 71..78. Orb X and Y come first. */
export const PUSH_DEFAULT: Binding[] = (
  ["orbX", "orbY", "position", "size", "density", "spray", "pitch", "filter"] as const
).map((target, i) => ({ cc: 71 + i, channel: 0, mode: "relative", target }));

export interface ParsedMessage { channel: number; cc: number; value: number }

export function parseControlChange(data: ArrayLike<number>): ParsedMessage | null {
  if (data.length < 3 || (data[0] & 0xf0) !== 0xb0) return null;
  return { channel: data[0] & 0x0f, cc: data[1], value: data[2] };
}

export const isEncoderPort = (name: string) => /push|encoder|endless/i.test(name);

export function upsertBinding(list: Binding[], next: Binding): Binding[] {
  return [...list.filter((b) => !(b.cc === next.cc && b.channel === next.channel) && b.target !== next.target), next];
}
