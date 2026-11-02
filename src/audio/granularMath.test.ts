import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { cutoffHz, grainSeconds, grainsPerSecond, hann, nextInterval, planGrain, semitones, stutterInterval, wrap } from "./granularMath";

const base = { position: 0.3, size: 0.5, density: 0.5, spray: 0.3, pitch: 0, octave: 0 };

describe("mappings", () => {
  it("cover their documented ranges", () => {
    expect(grainSeconds(0)).toBeCloseTo(0.02);
    expect(grainSeconds(1)).toBeCloseTo(0.4);
    expect(grainsPerSecond(0)).toBeCloseTo(2);
    expect(grainsPerSecond(1)).toBeCloseTo(80);
    expect(semitones(0.5)).toBe(0);
    expect(semitones(1)).toBe(12);
    expect(cutoffHz(1)).toBe(20000);
    expect(cutoffHz(0)).toBeCloseTo(300);
  });
  it("wraps negative positions", () => {
    expect(wrap(-0.25, 1)).toBeCloseTo(0.75);
    expect(wrap(1.25, 1)).toBeCloseTo(0.25);
  });
});

describe("planGrain", () => {
  it("is deterministic for a seed", () => {
    const a = createRng(5), b = createRng(5);
    expect(planGrain(base, 8, a)).toEqual(planGrain(base, 8, b));
  });
  it("keeps the read inside the buffer", () => {
    const r = createRng(1);
    for (let i = 0; i < 500; i++) {
      const g = planGrain({ ...base, position: Math.random() * 3 - 1, size: Math.random(), spray: Math.random(), pitch: Math.random() * 24 - 12 }, 8, r, i % 2 === 0);
      expect(g.offset).toBeGreaterThanOrEqual(0);
      expect(g.offset + g.sourceSeconds).toBeLessThanOrEqual(8 + 1e-9);
      expect(g.rate).toBeGreaterThan(0);
      expect(Math.abs(g.pan)).toBeLessThanOrEqual(1);
    }
  });
  it("is quieter per grain when grains overlap more", () => {
    const lo = planGrain({ ...base, density: 0.1 }, 8, createRng(2)), hi = planGrain({ ...base, density: 1 }, 8, createRng(2));
    expect(hi.gain).toBeLessThan(lo.gain);
  });
  it("transposes by the pitch setting", () => {
    expect(planGrain({ ...base, spray: 0, pitch: 12 }, 8, createRng(3)).rate).toBeCloseTo(2);
  });
});

describe("octave and stutter", () => {
  it("octave chance 1 shifts every grain up 12 semitones; 0 never does", () => {
    expect(planGrain({ ...base, spray: 0, octave: 1 }, 8, createRng(3)).rate).toBeCloseTo(2);
    expect(planGrain({ ...base, spray: 0, octave: 0 }, 8, createRng(3)).rate).toBeCloseTo(1);
  });
  it("octave applies to about the chosen share of grains", () => {
    const r = createRng(4);
    let up = 0;
    for (let i = 0; i < 2000; i++) if (planGrain({ ...base, spray: 0, octave: 0.5 }, 8, r).rate > 1.5) up++;
    expect(up / 2000).toBeCloseTo(0.5, 1);
  });
  it("stutter pulses a sixteenth note", () => {
    expect(stutterInterval(120)).toBeCloseTo(0.125);
    expect(stutterInterval(84)).toBeCloseTo(60 / 84 / 4);
  });
});

describe("timing and envelope", () => {
  it("averages one interval per grain rate", () => {
    const r = createRng(9);
    let t = 0;
    for (let i = 0; i < 2000; i++) t += nextInterval(0.5, r);
    expect(t / 2000).toBeCloseTo(1 / grainsPerSecond(0.5), 2);
  });
  it("hann starts and ends at zero and peaks at one", () => {
    const h = hann(33);
    expect(h[0]).toBeCloseTo(0);
    expect(h[32]).toBeCloseTo(0);
    expect(Math.max(...h)).toBeCloseTo(1);
  });
});
