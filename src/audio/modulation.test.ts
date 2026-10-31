import { describe, expect, it } from "vitest";
import { effective, gestureBoost } from "./modulation";

describe("effective", () => {
  it("adds orb X and inverted Y contributions", () => {
    expect(effective(0.3, 0.4, 0.2, 1, -1)).toBeCloseTo(0.3 + 0.4 + 0.2);
    expect(effective(0.7, 0.4, 0.2, -1, 1)).toBeCloseTo(0.7 - 0.4 - 0.2);
  });
  it("clamps to 0..1", () => {
    expect(effective(0.9, 1, 0, 1, 0)).toBe(1);
    expect(effective(0.1, 1, 0, -1, 0)).toBe(0);
  });
  it("applies boost", () => {
    expect(effective(0.5, 0, 0, 0, 0, 0.25)).toBeCloseTo(0.75);
  });
});

describe("gestureBoost", () => {
  it("builds density up during a riser and cuts it on a drop", () => {
    expect(gestureBoost(1, 0).density).toBeGreaterThan(0);
    expect(gestureBoost(0, 1).density).toBeLessThan(0);
  });
  it("is neutral at rest", () => {
    for (const v of Object.values(gestureBoost(0, 0))) expect(v).toBeCloseTo(0);
  });
});
