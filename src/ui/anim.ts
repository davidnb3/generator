/**
 * Progress 0..1 of an animation that started at `t0` and lasts `life` ms. Clamped on purpose: a frame's timestamp
 * can be a few ms older than an event stamped with performance.now(), which made the age negative and, through a
 * negative canvas radius, threw inside the draw loop.
 */
export const progress = (now: number, t0: number, life: number) => Math.min(1, Math.max(0, (now - t0) / life));
