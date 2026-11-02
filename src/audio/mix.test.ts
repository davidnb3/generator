import { describe, expect, it } from "vitest";
import { crossfade, meterPosition, rmsOf } from "./mix";

describe("crossfade", () => {
  it("is all a at 0 and all b at 1", () => {
    expect(crossfade(0).a).toBeCloseTo(1);
    expect(crossfade(0).b).toBeCloseTo(0);
    expect(crossfade(1).a).toBeCloseTo(0);
    expect(crossfade(1).b).toBeCloseTo(1);
  });
  it("keeps power constant across the sweep", () => {
    for (let x = 0; x <= 1; x += 0.1) {
      const { a, b } = crossfade(x);
      expect(a * a + b * b).toBeCloseTo(1);
    }
  });
  it("clamps out-of-range input", () => {
    expect(crossfade(2).b).toBeCloseTo(1);
    expect(crossfade(-1).a).toBeCloseTo(1);
  });
});

describe("meters", () => {
  it("computes rms", () => {
    expect(rmsOf([1, -1, 1, -1])).toBe(1);
    expect(rmsOf([0, 0])).toBe(0);
    expect(rmsOf([])).toBe(0);
  });
  it("maps -60 dB to empty and 0 dB to full", () => {
    expect(meterPosition(0)).toBe(0);
    expect(meterPosition(1)).toBeCloseTo(1);
    expect(meterPosition(0.1)).toBeCloseTo(40 / 60);
  });
});
