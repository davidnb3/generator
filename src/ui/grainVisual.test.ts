import { describe, expect, it } from "vitest";
import type { GrainEvent } from "../audio/GranularCloud";
import { grainAlpha, grainHalfSpan, grainRadius, grainTone, readFraction, visualLife } from "./grainVisual";

const grain = (over: Partial<GrainEvent["plan"]> = {}, rest: Partial<GrainEvent> = {}): GrainEvent => ({
  when: 0, reversed: false, voice: "cloud",
  plan: { offset: 2, sourceSeconds: 0.1, duration: 0.1, rate: 1, pan: 0, gain: 0.3, ...over },
  ...rest,
});

describe("readFraction", () => {
  it("is the middle of what the grain plays, as a share of the sample", () => {
    expect(readFraction(grain({ offset: 2, sourceSeconds: 1 }), 8)).toBeCloseTo(2.5 / 8);
  });
  it("counts reversed grains from the end", () => {
    expect(readFraction(grain({ offset: 1, sourceSeconds: 1 }, { reversed: true }), 8)).toBeCloseTo(1 - 1.5 / 8);
  });
  it("stays within 0..1", () => {
    expect(readFraction(grain({ offset: 7.9, sourceSeconds: 0.5 }), 8)).toBeLessThan(1);
    expect(readFraction(grain({ offset: 0, sourceSeconds: 0 }), 8)).toBe(0);
  });
});

describe("grainHalfSpan", () => {
  it("is half of what the grain plays, as a share of the sample", () => {
    expect(grainHalfSpan(grain({ sourceSeconds: 1 }), 8)).toBeCloseTo(1 / 16);
  });
  it("caps very long grains", () => {
    expect(grainHalfSpan(grain({ sourceSeconds: 20 }), 8)).toBe(0.3);
    expect(grainHalfSpan(grain({ sourceSeconds: 0 }), 8)).toBe(0);
  });
});

describe("tone, size, life and brightness", () => {
  it("colours by pitch and voice", () => {
    expect(grainTone(grain({ rate: 2 }))).toBe("up");
    expect(grainTone(grain({ rate: 0.5 }))).toBe("down");
    expect(grainTone(grain({ rate: 1 }))).toBe("plain");
    expect(grainTone(grain({ rate: 2 }, { voice: "drone" }))).toBe("drone");
  });
  it("draws longer grains bigger, the drone biggest", () => {
    expect(grainRadius(grain({ duration: 0.3 }))).toBeGreaterThan(grainRadius(grain({ duration: 0.02 })));
    expect(grainRadius(grain({ duration: 2.6 }, { voice: "drone" }))).toBeGreaterThan(grainRadius(grain({ duration: 0.4 })));
  });
  it("keeps short grains visible and long ones bounded", () => {
    expect(visualLife(grain({ duration: 0.01 }))).toBe(0.35);
    expect(visualLife(grain({ duration: 1 }))).toBe(1);
    expect(visualLife(grain({ duration: 4 }))).toBe(3);
  });
  it("fades overlapping, quiet grains", () => {
    expect(grainAlpha(grain({ gain: 0.05 }))).toBeLessThan(grainAlpha(grain({ gain: 0.5 })));
    expect(grainAlpha(grain({ gain: 5 }))).toBeLessThanOrEqual(1);
  });
});
