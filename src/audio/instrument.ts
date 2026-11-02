import { AudioProcessor, Param } from "@audiorective/core";
import { GESTURE_TYPES, MODULATED, PLAIN, type GestureType, type ModulatedId, type NumericId, type PlainId } from "./params";
import { clamp, depthOf, effective, gestureBoost, lerp, type Boost } from "./modulation";
import { gesturePhase } from "./gesture";
import { createRng, type Rng } from "./rng";
import { decodeSample, demoSample, type LoadResult, type SampleInfo } from "./sample";
import type { GrainEvent } from "./GranularCloud";
import { cutoffHz, rateOf, semitones } from "./granularMath";
import { Voices, type ControlKey, type Settable } from "./Voices";
import { advance, initialClock, phaseAt, type PlayerClock } from "./playerClock";
import type { HitEvent } from "./HitVoice";
import type { RoomId } from "./rooms";
import { Recorder } from "./export/recorder";
import { PREROLL } from "./export/render";
import type { ControlEvent, Take } from "./export/take";

type InstrumentParams = Record<NumericId, Param<number>> & {
  evolve: Param<boolean>;
  freeze: Param<boolean>;
  reverse: Param<boolean>;
  orbHeld: Param<boolean>;
  muteCloud: Param<boolean>;
  muteSlow: Param<boolean>;
  muteSpectral: Param<boolean>;
  room: Param<RoomId>;
  scatter: Param<boolean>;
  octave: Param<boolean>;
  stutter: Param<boolean>;
  gestureType: Param<GestureType>;
  gestureBars: Param<number>;
  gestureProgress: Param<number>;
  seed: Param<number>;
  sample: Param<SampleInfo>;
  recordingSince: Param<number | null>;
};

/** Seconds control changes are scheduled ahead of the audio clock. */
const CONTROL_LEAD = 0.02;

interface RunningGesture { type: GestureType; t0: number; dur: number; impacted: boolean }

/**
 * The instrument: sample, orb, knobs, modulation, gestures, and the signal chain
 * (granular cloud + slow player -> low-pass -> master -> limiter).
 * Space, drive and the spectral layer are not wired to sound yet.
 */
export class Instrument extends AudioProcessor<InstrumentParams> {
  private readonly _out: AudioNode;
  readonly voices: Voices;
  private readonly lastSent = new Map<ControlKey, { value: number; tc: number }>();
  private recorder: Recorder | null = null;
  private pending: { take: Take; control: ControlEvent[]; clock: PlayerClock } | null = null; // control times are absolute until the take stops
  private recentGrains: GrainEvent[] = [];
  private recentHits: HitEvent[] = [];
  private takeCount = 0;
  /** Slow-player clock: its position follows the logged rate curves exactly, so a take can say where the loop was. */
  private clock: PlayerClock = initialClock(0);
  private playerStart = 0; // context time the slow player (re)starts; its rate is never scheduled before this
  /** The most recent recording, kept for Export WAV. */
  lastTake: Take | null = null;
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
    const voices = new Voices(ctx, 4081);
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
          room: param<RoomId>({ default: "hall" }),
          scatter: param<boolean>({ default: false }),
          octave: param<boolean>({ default: false }),
          stutter: param<boolean>({ default: false }),
          gestureType: param<GestureType>({ default: "riser" }),
          gestureBars: param<number>({ default: 8 }),
          gestureProgress: param<number>({ default: 0 }),
          seed: param<number>({ default: 4081 }),
          sample: param<SampleInfo>({ default: demoSample(ctx) }),
          recordingSince: param<number | null>({ default: null }),
        },
        latency: 0,
      };
    });
    this.voices = voices;
    this._out = voices.output;
    this.rng = createRng(this.params.seed.value);

    voices.cloud.onGrain = (e) => {
      this.recentGrains.push(e);
      this.pending?.take.grains.push(e);
      const cutoff = ctx.currentTime - 3;
      if (this.recentGrains.length > 600) this.recentGrains = this.recentGrains.filter((g) => g.when > cutoff);
    };
    voices.hit.onHit = (e) => {
      this.recentHits.push(e);
      if (this.recentHits.length > 40) this.recentHits = this.recentHits.filter((h) => h.when + 6 > ctx.currentTime);
      this.pending?.take.hits.push(e);
    };
    // The slow player must start at a known time, or a take can't say where its loop is. Starting at time 0 on a
    // suspended context isn't one: the first audio after resume lands a few tens of ms later. So once the context
    // is running, (re)start at an explicit time just ahead and anchor the clock to it.
    let playerAnchored = false;
    const startPlayer = () => {
      // The engine starts a source on a render-quantum boundary (128 frames); starting between boundaries would put the
      // loop up to a quantum behind the clock, so land on one.
      const quantum = 128 / ctx.sampleRate, when = Math.ceil((ctx.currentTime + 0.1) / quantum) * quantum;
      voices.setBuffer(this.params.sample.value.buffer, 0, when);
      this.clock = initialClock(when);
      this.playerStart = when;
      this.lastSent.delete("rate"); // restarting the player resets its rate, so the next frame must send it again
      playerAnchored = true;
    };
    this.effect(() => {
      const buffer = this.params.sample.value.buffer;
      if (ctx.state === "running") startPlayer();
      else { voices.setBuffer(buffer, 0, ctx.currentTime); playerAnchored = false; }
    });
    ctx.addEventListener("statechange", () => { if (ctx.state === "running" && !playerAnchored) startPlayer(); });
    this.effect(() => voices.setRoom(this.params.room.value, this.params.sample.value.buffer));
    if (ctx instanceof AudioContext) voices.cloud.start();
  }

  get cloud() {
    return this.voices.cloud;
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
    this.scheduleHits(type, dur / 1000);
  }

  /** The gesture's sound: a reversed swell into the hit, timed on the audio clock. */
  private scheduleHits(type: GestureType, seconds: number) {
    const start = this.context.currentTime + 0.05, hit = this.voices.hit;
    const swellLen = Math.min(1.2, seconds * 0.6);
    if (type === "drop") { hit.impact(start); return; }
    const end = start + (type === "both" ? seconds * 0.75 : seconds);
    hit.swell(end - swellLen, swellLen);
    if (type === "both") hit.impact(end);
  }
  get gestureActive() {
    return this.running !== null;
  }

  /* ---- seed ---- */

  setSeed(seed: number) {
    this.params.seed.value = seed;
    this.rng = createRng(seed);
    this.cloud.reseed(seed);
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
    if (p.scatter.value) { this.boost.spray = (this.boost.spray ?? 0) + 0.5; this.boost.density = (this.boost.density ?? 0) + 0.15; }

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

    this.applyAudio();

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

  /** Pushes the values you hear to the audio graph. Smoothed, and only sent when they change. */
  private applyAudio() {
    const p = this.params, c = this.voices.cloud.params, st = semitones(this.effective("pitch")), ctrl = this.voices.control;
    c.position.value = this.effective("position");
    c.size.value = this.effective("size");
    c.density.value = this.effective("density");
    c.spray.value = this.effective("spray");
    c.pitch.value = st;
    c.playhead.value = this.live.head;
    c.reverse.value = p.reverse.value;
    const rate = 0.25 * rateOf(st);
    this.send("cloud", ctrl.cloud, p.muteCloud.value ? 0 : this.effective("cloud") * 0.9, 0.05);
    this.send("slow", ctrl.slow, p.muteSlow.value ? 0 : 0.3, 0.05);
    this.send("rate", ctrl.rate, rate, 0.1);
    this.send("cutoff", ctrl.cutoff, cutoffHz(this.effective("filter")), 0.03);

    // effects: Space is the room's level, Spectral is the shifted layer's level and how far it shifts, Drive is how saturated, Wet blends them against the dry sound
    const wet = p.wet.value, spectral = this.effective("spectral");
    const drive = this.effective("drive");
    this.send("drive", ctrl.drive, drive, 0.05);
    this.send("makeup", ctrl.makeup, 1 / (1 + 6 * drive), 0.05); // measured: full drive is about 7x louder, and the boost fades in linearly with the blend
    this.send("spectral", ctrl.spectral, p.muteSpectral.value ? 0 : spectral * wet * 1.2, 0.08);
    this.send("shift", ctrl.shift, 20 * Math.pow(40, spectral), 0.12);
    this.send("space", ctrl.space, this.effective("space") * wet * 1.2, 0.1);
    this.send("dry", ctrl.dry, 1 - 0.4 * wet, 0.05);
    c.octave.value = p.octave.value ? 0.5 : 0;
    c.stutter.value = p.stutter.value;
  }

  private send(key: ControlKey, param: Settable, value: number, timeConstant: number) {
    const last = this.lastSent.get(key);
    if (last !== undefined && Math.abs(last.value - value) < 0.002 * Math.max(1, Math.abs(value))) return;
    this.lastSent.set(key, { value, tc: timeConstant });
    // Schedule a little ahead: a change stamped "now" is only applied once the audio thread sees it, by which time the
    // stamp is in the past, and live and replay would disagree by a few ms per change. Rate also waits for the player
    // to start, or the loop position (and its replay) would be wrong.
    const ahead = this.context.currentTime + CONTROL_LEAD;
    const t = key === "rate" ? Math.max(ahead, this.playerStart) : ahead;
    param.setTargetAtTime(value, t, timeConstant);
    if (key === "rate") this.clock = advance(this.clock, t, value, timeConstant);
    this.pending?.control.push({ t, key, value, tc: timeConstant });
  }

  destroy() {
    this.voices.destroy();
    super.destroy();
  }

  /* ---- recording ---- */

  get recording() {
    return this.recorder?.recording ?? false;
  }

  /** Gets recording ready (loads the worklet) so the first take starts cleanly. Safe to call repeatedly. */
  async prepareRecording() {
    const ctx = this.context;
    if (!(ctx instanceof AudioContext)) return;
    this.recorder ??= new Recorder(ctx, this.output);
    await this.recorder.prepare();
  }

  /** Starts capturing the master output and logging the take (grains and control values). */
  async startRecording() {
    const ctx = this.context;
    if (!(ctx instanceof AudioContext)) throw new Error("Recording needs a live audio context.");
    if (ctx.state !== "running") throw new Error("Audio is off. Click anywhere on the page, then record.");
    this.recorder ??= new Recorder(ctx, this.output);
    const now = ctx.currentTime, s = this.params.sample.value;
    const take: Take = {
      id: ++this.takeCount, seed: this.params.seed.value, sampleRate: ctx.sampleRate, t0: 0, duration: 0, sample: s,
      playerPhase: 0, grains: this.recentGrains.filter((g) => g.when + g.plan.duration > now - PREROLL),
      hits: this.recentHits.filter((h) => h.when + 3 > now - PREROLL), room: this.params.room.value, control: [], pcm: [],
    };
    // start the log from the full current state, so it doesn't depend on another frame arriving
    this.pending = { take, clock: this.clock, control: [...this.lastSent].map(([key, v]) => ({ t: now, key, value: v.value, tc: v.tc })) };
    try {
      await this.recorder.start();
    } catch (e) {
      this.pending = null;
      throw e;
    }
    this.params.recordingSince.value = performance.now();
  }

  /** Stops capturing and returns the finished take. */
  async stopRecording(): Promise<Take> {
    const pending = this.pending;
    if (!pending || !this.recorder) throw new Error("Not recording.");
    const rec = await this.recorder.stop();
    this.pending = null;
    this.params.recordingSince.value = null;
    const take = pending.take, t0 = rec.startTime;
    take.t0 = t0;
    // loop position at the first captured frame: replay the rate events from the clock snapshot taken at start
    let clock = pending.clock;
    for (const e of pending.control) if (e.key === "rate" && e.t <= t0) clock = advance(clock, Math.max(clock.t, e.t), e.value, e.tc);
    take.playerPhase = phaseAt(clock, t0, take.sample.duration);
    take.duration = rec.channels[0].length / rec.sampleRate;
    take.pcm = rec.channels;
    take.control = pending.control.map((e) => ({ ...e, t: Math.max(0, e.t - t0) }));
    take.grains = take.grains.filter((g) => g.when >= t0 - PREROLL && g.when <= t0 + take.duration);
    take.hits = take.hits.filter((h) => h.when >= t0 - PREROLL && h.when <= t0 + take.duration);
    this.lastTake = take;
    return take;
  }

  static readonly gestureTypes = GESTURE_TYPES;
}
