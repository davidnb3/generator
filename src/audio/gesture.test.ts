import { describe, expect, it } from "vitest";
import { GESTURE_CURVES, curveValue, gesturePhase } from "./gesture";

describe("gesturePhase", () => {
  it("riser builds and never drops", () => {
    expect(gesturePhase("riser", 0.5).rise).toBeCloseTo(0.25);
    expect(gesturePhase("riser", 1).drop).toBe(0);
  });
  it("drop impacts immediately and decays", () => {
    expect(gesturePhase("drop", 0).impact).toBe(true);
    expect(gesturePhase("drop", 0).drop).toBe(1);
    expect(gesturePhase("drop", 1).drop).toBe(0);
  });
  it("both hits at 75%", () => {
    expect(gesturePhase("both", 0.74).impact).toBe(false);
    expect(gesturePhase("both", 0.8).impact).toBe(true);
    expect(gesturePhase("both", 0.74).rise).toBeGreaterThan(0.9);
  });
});

describe("curveValue", () => {
  it("riser density rises, size falls", () => {
    const [density, size] = GESTURE_CURVES;
    expect(curveValue(density, 1, "riser", 0.5)).toBeGreaterThan(curveValue(density, 0, "riser", 0.5));
    expect(curveValue(size, 1, "riser", 0.5)).toBeLessThan(curveValue(size, 0, "riser", 0.5));
  });
  it("stays within 0..1", () => {
    for (const type of ["riser", "drop", "both"] as const)
      for (const c of GESTURE_CURVES)
        for (let i = 0; i <= 20; i++) {
          const v = curveValue(c, i / 20, type, 0.5);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
  });
});
