/**
 * Where the slow player's loop is. Its rate follows setTargetAtTime curves, r(t) = target + (r0 - target) e^(-t/tc),
 * which integrate in closed form, so the position at any time follows from the logged rate events alone.
 */
export interface PlayerClock { t: number; phase: number; rate: number; target: number; tc: number }

export const BASE_RATE = 0.25;
export const initialClock = (t: number): PlayerClock => ({ t, phase: 0, rate: BASE_RATE, target: BASE_RATE, tc: 0.1 });

/** Unwrapped position (in source seconds) and instantaneous rate at time `to`. */
export function integrate(c: PlayerClock, to: number) {
  const dt = Math.max(0, to - c.t), k = Math.exp(-dt / c.tc);
  return { phase: c.phase + c.target * dt + (c.rate - c.target) * c.tc * (1 - k), rate: c.target + (c.rate - c.target) * k };
}

/** The clock after a new target is scheduled at time `t`. */
export function advance(c: PlayerClock, t: number, target: number, tc: number): PlayerClock {
  const { phase, rate } = integrate(c, t);
  return { t, phase, rate, target, tc };
}

/** Loop position in seconds at time `to` for a loop of `duration` seconds. */
export function phaseAt(c: PlayerClock, to: number, duration: number) {
  return ((integrate(c, to).phase % duration) + duration) % duration;
}
