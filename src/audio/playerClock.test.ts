import { describe, expect, it } from "vitest";
import { advance, initialClock, integrate, phaseAt } from "./playerClock";

describe("playerClock", () => {
  it("advances at the base rate when nothing changes", () => {
    expect(integrate(initialClock(2), 6).phase).toBeCloseTo(0.25 * 4);
  });
  it("matches a numerical integral of a rate change", () => {
    const c = advance(initialClock(0), 1, 1, 0.5);
    const T = 4, N = 200000;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const t = 1 + ((i + 0.5) / N) * (T - 1);
      sum += (1 + (c.rate - 1) * Math.exp(-(t - 1) / 0.5)) * ((T - 1) / N);
    }
    expect(integrate(c, T).phase).toBeCloseTo(0.25 * 1 + sum, 4);
  });
  it("is continuous across events", () => {
    const a = advance(initialClock(0), 1, 0.8, 0.1);
    const mid = integrate(a, 1.05);
    const b = advance(a, 1.05, 0.3, 0.1);
    expect(b.phase).toBeCloseTo(mid.phase);
    expect(b.rate).toBeCloseTo(mid.rate);
  });
  it("wraps by the loop length and settles on the target rate", () => {
    expect(phaseAt(initialClock(0), 40, 8)).toBeCloseTo((0.25 * 40) % 8);
    expect(integrate(advance(initialClock(0), 0, 2, 0.1), 5).rate).toBeCloseTo(2, 6);
  });
});
