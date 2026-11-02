import { describe, expect, it } from "vitest";
import { ROOMS, ROOM_CHOICES, findImpactStart, generateIr, sampleIr } from "./rooms";

const SR = 8000;
const energy = (a: Float32Array, from: number, to: number) => { let e = 0; for (let i = from; i < to; i++) e += a[i] * a[i]; return e; };

describe("generateIr", () => {
  it("is deterministic and finite for every room", () => {
    for (const room of ROOMS) {
      const a = generateIr(room, SR), b = generateIr(room, SR);
      expect(a[0]).toEqual(b[0]);
      expect(a[0].every(Number.isFinite)).toBe(true);
      expect(a[0].length).toBeLessThanOrEqual(6 * SR);
    }
  });
  it("decays: the first quarter holds far more energy than the last", () => {
    for (const room of ROOMS) {
      const [l] = generateIr(room, SR), q = Math.floor(l.length / 4);
      expect(energy(l, 0, q)).toBeGreaterThan(energy(l, l.length - q, l.length) * 20);
    }
  });
  it("is decorrelated between channels and longer rooms are longer", () => {
    const [l, r] = generateIr(ROOMS[2], SR);
    expect(l).not.toEqual(r);
    expect(generateIr(ROOMS[3], SR)[0].length).toBeGreaterThan(generateIr(ROOMS[0], SR)[0].length);
  });
  it("offers the built-in rooms plus your sample", () => {
    expect(ROOM_CHOICES.map((r) => r.id)).toContain("sample");
    expect(ROOM_CHOICES.length).toBe(ROOMS.length + 1);
  });
});

describe("sampleIr", () => {
  it("caps the length, fades the tail, and makes stereo from mono", () => {
    const mono = Float32Array.from({ length: 10 * SR }, (_, i) => Math.sin(i / 7) + 0.3);
    const [l, r] = sampleIr([mono], SR, 4);
    expect(l.length).toBe(4 * SR);
    expect(Math.abs(l[l.length - 1])).toBeLessThan(1e-3);
    expect(l[0]).toBeCloseTo(0, 1);
    expect(l).not.toEqual(r);
    expect(l.reduce((a, b) => a + b, 0) / l.length).toBeLessThan(0.05); // DC removed
  });
  it("keeps stereo channels apart", () => {
    const a = Float32Array.from({ length: SR }, (_, i) => Math.sin(i)), b = Float32Array.from({ length: SR }, (_, i) => Math.cos(i));
    const [l, r] = sampleIr([a, b], SR);
    expect(l).not.toEqual(r);
  });
});

describe("findImpactStart", () => {
  it("finds the loudest burst", () => {
    const data = new Float32Array(6 * SR);
    for (let i = 0; i < data.length; i++) data[i] = 0.02 * Math.sin(i / 3);
    const at = Math.floor(3.0 * SR);
    for (let i = 0; i < 0.3 * SR; i++) data[at + i] = Math.sin(i / 2) * Math.exp(-i / (0.1 * SR));
    expect(Math.abs(findImpactStart(data, SR) / SR - 3.0)).toBeLessThan(0.06);
  });
  it("copes with silence and tiny inputs", () => {
    expect(findImpactStart(new Float32Array(SR), SR)).toBeGreaterThanOrEqual(0);
    expect(findImpactStart(new Float32Array(3), SR)).toBe(0);
  });
});
