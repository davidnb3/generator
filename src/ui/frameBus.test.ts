import { describe, expect, it, vi } from "vitest";

const queue: FrameRequestCallback[] = [];
(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: FrameRequestCallback) => { queue.push(cb); return queue.length; };
const runFrame = (t: number) => { const cb = queue.shift(); cb?.(t); };

describe("frame loop", () => {
  it("keeps running other subscribers, and keeps scheduling, when one throws", async () => {
    const { subscribeFrame } = await import("./frameBus");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let good = 0;
    subscribeFrame(() => { throw new Error("boom"); }, 0);
    subscribeFrame(() => { good++; }, 1);
    runFrame(16);
    runFrame(32);
    runFrame(48);
    expect(good).toBe(3);
    expect(queue.length).toBe(1); // still scheduled
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
