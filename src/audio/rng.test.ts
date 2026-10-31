import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

describe("createRng", () => {
  it("repeats for the same seed", () => {
    const a = createRng(4081), b = createRng(4081);
    expect(Array.from({ length: 8 }, a)).toEqual(Array.from({ length: 8 }, b));
  });
  it("differs across seeds and stays in [0, 1)", () => {
    const a = createRng(1), b = createRng(2);
    expect(a()).not.toBe(b());
    const r = createRng(9);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
