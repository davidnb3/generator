import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

const text = (v: DataView, at: number, n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(v.getUint8(at + i))).join("");
const s24 = (v: DataView, at: number) => { const n = v.getUint8(at) | (v.getUint8(at + 1) << 8) | (v.getUint8(at + 2) << 16); return n & 0x800000 ? n - 0x1000000 : n; };

describe("encodeWav pcm24", () => {
  const L = Float32Array.from([0, 0.5, -0.5, 1]), R = Float32Array.from([1, -1, 0.25, 0]);
  const buf = encodeWav([L, R], 44100), v = new DataView(buf);

  it("writes a valid header", () => {
    expect(text(v, 0, 4)).toBe("RIFF");
    expect(v.getUint32(4, true)).toBe(buf.byteLength - 8);
    expect(text(v, 8, 4)).toBe("WAVE");
    expect(text(v, 12, 4)).toBe("fmt ");
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(2); // channels
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(28, true)).toBe(44100 * 2 * 3); // byte rate
    expect(v.getUint16(32, true)).toBe(6); // block align
    expect(v.getUint16(34, true)).toBe(24);
    expect(text(v, 36, 4)).toBe("data");
    expect(v.getUint32(40, true)).toBe(4 * 2 * 3);
    expect(buf.byteLength).toBe(44 + 24);
  });
  it("interleaves channels and scales to 24-bit", () => {
    expect(s24(v, 44)).toBe(0); // L0
    expect(s24(v, 47)).toBe(8388607); // R0 = 1
    expect(s24(v, 50)).toBe(Math.round(0.5 * 8388607)); // L1
    expect(s24(v, 53)).toBe(-8388607); // R1 = -1
  });
  it("clips out-of-range samples instead of wrapping", () => {
    const w = new DataView(encodeWav([Float32Array.from([2, -2])], 48000));
    expect(s24(w, 44)).toBe(8388607);
    expect(s24(w, 47)).toBe(-8388607);
  });
});

describe("encodeWav float32", () => {
  it("stores exact floats with a float format tag and fact chunk", () => {
    const buf = encodeWav([Float32Array.from([0.25, -0.75])], 48000, "float32"), v = new DataView(buf);
    expect(v.getUint16(20, true)).toBe(3);
    expect(v.getUint16(34, true)).toBe(32);
    expect(text(v, 36, 4)).toBe("fact");
    expect(v.getUint32(44, true)).toBe(2); // frame count
    expect(text(v, 48, 4)).toBe("data");
    expect(v.getFloat32(56, true)).toBe(0.25);
    expect(v.getFloat32(60, true)).toBe(-0.75);
  });
});

describe("encodeWav edge cases", () => {
  it("handles mono and empty input", () => {
    expect(encodeWav([Float32Array.from([0.1])], 44100).byteLength).toBe(44 + 3);
    expect(encodeWav([new Float32Array(0), new Float32Array(0)], 44100).byteLength).toBe(44);
  });
});
