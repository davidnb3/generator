import { describe, expect, it } from "vitest";
import { PEAK_COUNT, emptySample } from "./sample";

const fakeContext = { sampleRate: 44100, createBuffer: (channels: number, length: number, rate: number) => ({ numberOfChannels: channels, length, sampleRate: rate, duration: length / rate }) } as unknown as BaseAudioContext;

describe("emptySample", () => {
  it("is a silent placeholder, marked empty", () => {
    const s = emptySample(fakeContext);
    expect(s.empty).toBe(true);
    expect(s.name).toBe("No sound yet");
    expect(s.duration).toBe(8);
    expect(s.peaks).toHaveLength(PEAK_COUNT);
    expect(s.peaks.every((p) => p === 0)).toBe(true);
    expect(s.buffer.length).toBe(44100 * 8);
  });
});
