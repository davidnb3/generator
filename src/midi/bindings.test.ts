import { describe, expect, it } from "vitest";
import { PUSH_DEFAULT, decodeMessage, decodeRelative, parseControlChange, upsertBinding } from "./bindings";

describe("decodeRelative", () => {
  it("reads clockwise and counter-clockwise ticks", () => {
    expect(decodeRelative(1)).toBe(1);
    expect(decodeRelative(3)).toBe(3);
    expect(decodeRelative(127)).toBe(-1);
    expect(decodeRelative(125)).toBe(-3);
    expect(decodeRelative(0)).toBe(0);
  });
});

describe("decodeMessage", () => {
  it("nudges for relative and sets for absolute", () => {
    const rel = { cc: 71, channel: 0, mode: "relative", target: "orbX" } as const;
    expect(decodeMessage(rel, 127)).toEqual({ kind: "nudge", amount: -0.01 });
    const abs = { ...rel, mode: "absolute" } as const;
    expect(decodeMessage(abs, 127)).toEqual({ kind: "set", position: 1 });
  });
});

describe("parseControlChange", () => {
  it("parses CC and ignores other messages", () => {
    expect(parseControlChange([0xb0, 71, 3])).toEqual({ channel: 0, cc: 71, value: 3 });
    expect(parseControlChange([0xb2, 10, 64])?.channel).toBe(2);
    expect(parseControlChange([0x90, 60, 100])).toBeNull();
  });
});

describe("upsertBinding", () => {
  it("replaces a binding for the same CC or the same target", () => {
    const list = upsertBinding(PUSH_DEFAULT, { cc: 71, channel: 0, mode: "absolute", target: "drive" });
    expect(list.filter((b) => b.cc === 71)).toHaveLength(1);
    expect(list.filter((b) => b.target === "drive")).toHaveLength(1);
    expect(list.find((b) => b.target === "orbX")).toBeUndefined();
  });
  it("default map starts with orb X and Y on CC 71 and 72", () => {
    expect(PUSH_DEFAULT[0]).toMatchObject({ cc: 71, target: "orbX" });
    expect(PUSH_DEFAULT[1]).toMatchObject({ cc: 72, target: "orbY" });
  });
});
