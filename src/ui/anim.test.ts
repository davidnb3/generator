import { describe, expect, it } from "vitest";
import { progress } from "./anim";

describe("progress", () => {
  it("runs 0 to 1 over the lifetime", () => {
    expect(progress(1000, 1000, 500)).toBe(0);
    expect(progress(1250, 1000, 500)).toBeCloseTo(0.5);
    expect(progress(1500, 1000, 500)).toBe(1);
  });
  it("never goes negative when the frame is older than the event", () => {
    expect(progress(999.4, 1000, 500)).toBe(0);
    expect(progress(0, 1000, 500)).toBe(0);
  });
  it("never exceeds 1", () => {
    expect(progress(99999, 1000, 500)).toBe(1);
  });
});
