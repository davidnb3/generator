import { AudioProcessor, Param } from "@audiorective/core";
import { GESTURE_TYPES, MODULATED, PLAIN, type GestureType, type ModulatedId, type NumericId, type PlainId } from "./params";
import { clamp, depthOf, effective, gestureBoost, lerp, type Boost } from "./modulation";
import { gesturePhase } from "./gesture";
import { createRng, type Rng } from "./rng";
import { decodeSample, demoSample, type LoadResult, type SampleInfo } from "./sample";

type InstrumentParams = Record<NumericId, Param<number>> & {
  evolve: Param<boolean>;
  freeze: Param<boolean>;
  reverse: Param<boolean>;
  orbHeld: Param<boolean>;
  muteCloud: Param<boolean>;
  muteSlow: Param<boolean>;
  muteSpectral: Param<boolean>;
  gestureType: Param<GestureType>;
  gestureBars: Param<number>;
  gestureProgress: Param<number>;
  seed: Param<number>;
  sample: Param<SampleInfo>;
  recordingSince: Param<number | null>;
};

interface RunningGesture { type: GestureType; t0: number; dur: number; impacted: boolean }

/**
 * The instrument's state and behaviour: sample, orb position, knobs, modulation, gestures.
 * No sound is produced yet; the granular cloud, layers and export plug into this processor.
 */
export class Instrument extends AudioProcessor<InstrumentParams> {
  private readonly _out: GainNode;
  private rng: Rng;
  private running: RunningGesture | null = null;
  private target = { x: 0.28, y: 0.22 };
  private nextTarget = 0;
  private boost: Boost = {};

  /** Per-frame values read by the canvases. Not reactive, because they change every frame. */
  readonly live = {
    head: 0,
    rise: 0,
    drop: 0,
    impacts: 0, // increments on every gesture hit; views react by comparing with their last seen value
    level: [0.3, 0.3, 0.2] as number[], // placeholder meters until the audio engine exists
    meter: [0.4, 0.4] as number[],
    db: -9,
  };

  constructor(ctx: BaseAudioContext) {
    const out = new GainNode(ctx);
    super(ctx, ({ param }) => {
      const nums = {} as Record<NumericId, Param<number>>;
      for (const m of MODULATED) nums[m.id] = param<number>({ default: m.default, label: m.label, min: 0, max: 1, step: 0.01 });
      for (const p of PLAIN) nums[p.id] = param<number>({ default: p.default, label: p.label, min: 0, max: 1, step: 0.01 });
      nums.orbX = param<number>({ default: 0.28, label: "Texture", min: -1, max: 1, step: 0.01 });
      nums.orbY = param<number>({ default: 0.22, label: "Energy", min: -1, max: 1, step: 0.01 });
      return {
        params: {
          ...nums,
          evolve: param<boolean>({ default: true }),
          freeze: param<boolean>({ default: false }),
          reverse: param<boolean>({ default: false }),
          orbHeld: param<boolean>({ default: false }),
          muteCloud: param<boolean>({ default: false }),
          muteSlow: param<boolean>({ default: false }),
          muteSpectral: param<boolean>({ default: false }),
          gestureType: param<GestureType>({ default: "riser" }),
          gestureBars: param<number>({ default: 8 }),
          gestureProgress: param<number>({ default: 0 }),
          seed: param<number>({ default: 4081 }),
          sample: param<SampleInfo>({ default: demoSample() }),
          recordingSince: param<number | null>({ default: null }),
        },
      };
    });
    this._out = out;
    this.rng = createRng(this.params.seed.value);
  }

  get output() {
    return this._out;
  }

  /* ---- orb ---- */

  /** Moves the orb by hand (pointer, keyboard, MIDI) and keeps evolve from fighting the user. */
  setOrb(x: number, y: number) {
    const cx = clamp(x, -1, 1), cy = clamp(y, -1, 1), m = Math.hypot(cx, cy) || 1, k = m > 1 ? 1 / m : 1;
    this.params.orbX.value = cx * k;
    this.params.orbY.value = cy * k;
    this.target = { x: cx * k, y: cy * k };
    this.nextTarget = performance.now() + 3500;
  }
  nudgeOrb(dx: number, dy: number) {
    this.setOrb(this.params.orbX.value + dx, this.params.orbY.value + dy);
  }
  holdOrb(held: boolean) {
    this.params.orbHeld.value = held;
    if (!held) this.nextTarget = performance.now() + 3500;
  }

  /* ---- generic control access for keyboard and MIDI ---- */

  /** Sets a numeric control from a 0..1 position along its own range. */
  setNormalized(id: NumericId, v: number) {
    const p = this.params[id], min = p.min ?? 0, max = p.max ?? 1;
    const value = lerp(min, max, clamp(v));
    if (id === "orbX") this.setOrb(value, this.params.orbY.value);
    else if (id === "orbY") this.setOrb(this.params.orbX.value, value);
    else p.value = value;
  }
  /** Moves a numeric control by a fraction of its own range. */
  nudgeNormalized(id: NumericId, d: number) {
    const p = this.params[id], min = p.min ?? 0, max = p.max ?? 1;
    this.setNormalized(id, (p.value - min) / (max - min) + d);
  }

  /** Factory default of a numeric control, for double-click reset. */
  defaultOf(id: NumericId): number {
    const m = MODULATED.find((x) => x.id === id) ?? PLAIN.find((x) => x.id === id);
    return m ? m.default : 0;
  }

  /** Value heard for a knob after orb modulation and gesture boost. */
  effective(id: ModulatedId | PlainId): number {
    const d = depthOf(id);
    return effective(this.params[id].value, d?.ax ?? 0, d?.ay ?? 0, this.params.orbX.value, this.params.orbY.value, (this.boost as Record<string, number>)[id] ?? 0);
  }

  /* ---- gestures ---- */

  fire() {
    if (this.running) return;
    const type = this.params.gestureType.value;
    const dur = type === "drop" ? 2200 : Math.max(2500, this.params.gestureBars.value * 600);
    this.running = { type, t0: performance.now(), dur, impacted: false };
  }
  get gestureActive() {
    return this.running !== null;
  }

  /* ---- seed ---- */

  setSeed(seed: number) {
    this.params.seed.value = seed;
    this.rng = createRng(seed);
  }

  /* ---- sample ---- */

  async loadSample(file: File): Promise<LoadResult> {
    const result = await decodeSample(this.context, file);
    if (result.ok) this.params.sample.value = result.sample;
    return result;
  }

  /* ---- per-frame update ---- */

  tick(now: number, dt: number) {
    const p = this.params, live = this.live;
    if (!p.freeze.value) live.head = (live.head + (dt / 1000 / p.sample.value.duration) * (p.reverse.value ? -1 : 1) + 1) % 1;

    let rise = 0, drop = 0;
    const g = this.running;
    if (g) {
      const t = (now - g.t0) / g.dur;
      if (t >= 1) {
        this.running = null;
        p.gestureProgress.value = 0;
      } else {
        const ph = gesturePhase(g.type, t);
        rise = ph.rise; drop = ph.drop;
        if (ph.impact && !g.impacted) { g.impacted = true; live.impacts++; }
        p.gestureProgress.value = t;
        if (g.type !== "drop") {
          const k = g.type === "riser" || t < 0.75 ? rise : 0, a = 1 - Math.pow(0.96, dt / 16.7);
          p.orbX.value = lerp(p.orbX.value, 0.15 + 0.7 * k, a);
          p.orbY.value = lerp(p.orbY.value, 0.25 - 0.95 * k, a);
        }
      }
    }
    live.rise = rise; live.drop = drop;
    this.boost = gestureBoost(rise, drop);

    if (p.evolve.value && !p.orbHeld.value && !this.running) {
      if (now > this.nextTarget) {
        const a = this.rng() * Math.PI * 2, m = Math.sqrt(this.rng()) * 0.88;
        this.target = { x: Math.cos(a) * m, y: Math.sin(a) * m };
        this.nextTarget = now + 2800 + this.rng() * 3200;
      }
      const a = 1 - Math.pow(0.5, dt / 380);
      p.orbX.value = lerp(p.orbX.value, this.target.x, a);
      p.orbY.value = lerp(p.orbY.value, this.target.y, a);
    }

    // placeholder meters (cosmetic, so Math.random is fine; no sound is produced yet)
    const dens = this.effective("density"), pitch = this.effective("pitch"), space = this.effective("space"), filter = this.effective("filter");
    const target = [0.25 + dens * 0.7, 0.2 + (1 - pitch) * 0.3 + (p.reverse.value ? 0.2 : 0), 0.1 + space * 0.5 + filter * 0.2];
    const muted = [p.muteCloud.value, p.muteSlow.value, p.muteSpectral.value];
    const f = 1 - Math.pow(0.6, dt / 16.7);
    target.forEach((tg, i) => (live.level[i] = lerp(live.level[i], muted[i] ? 0 : clamp(tg + (Math.random() - 0.5) * 0.25), f)));
    const master = ((live.level[0] + live.level[1] + live.level[2]) / 3) * (0.4 + p.wet.value * 0.4);
    for (let c = 0; c < 2; c++) live.meter[c] = lerp(live.meter[c], clamp(master + (Math.random() - 0.5) * 0.15), f);
    live.db = -30 + master * 28;
  }

  /* ---- recording (stub until the audio engine exists) ---- */

  toggleRecording(): number | null {
    const p = this.params.recordingSince;
    if (p.value === null) { p.value = performance.now(); return null; }
    const secs = (performance.now() - p.value) / 1000;
    p.value = null;
    return secs;
  }

  static readonly gestureTypes = GESTURE_TYPES;
}
