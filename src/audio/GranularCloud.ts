import { AudioProcessor, reverseBuffer, type Param, type SchedulableParam } from "@audiorective/core";
import { createRng, type Rng } from "./rng";
import { hann, nextInterval, planGrain, type GrainPlan } from "./granularMath";

/** A grain that was created: when it starts (context seconds) and exactly what it plays. */
export type CloudVoice = "cloud" | "drone";
export interface GrainEvent { when: number; plan: GrainPlan; reversed: boolean; voice: CloudVoice }

type CloudParams = {
  position: Param<number>; // offset from the playhead, 0..1 of the sample
  size: Param<number>; // 0..1
  density: Param<number>; // 0..1
  spray: Param<number>; // 0..1
  pitch: Param<number>; // semitones
  playhead: Param<number>; // 0..1, set by the instrument; the cloud reads at playhead + position
  reverse: Param<boolean>;
  octave: Param<number>; // 0..1 chance of an octave-up grain
  level: SchedulableParam;
};

const MAX_GRAINS = 160; // long grains at high density overlap a lot; past this, grains are skipped (their level is already compensated)
const LOOKAHEAD = 0.12; // seconds scheduled ahead of the clock
const TICK_MS = 25;

/**
 * Granular cloud: short enveloped, panned, pitched grains read from a sample. Grain times and
 * settings come from a seeded RNG, and `scheduleUntil` is the only thing that creates grains,
 * so a live timer and an offline render run the same code.
 */
export class GranularCloud extends AudioProcessor<CloudParams> {
  private readonly _out: GainNode;
  private _buffer: AudioBuffer | null = null;
  private _reversed: AudioBuffer | null = null;
  private rng: Rng;
  private nextTime = 0;
  private active = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly window = hann();
  /** Called for every grain that is created; a recording uses it to log the take. */
  onGrain: ((e: GrainEvent) => void) | null = null;

  constructor(ctx: BaseAudioContext, seed = 1, private readonly voice: CloudVoice = "cloud") {
    const out = new GainNode(ctx, { gain: 0.8 });
    super(ctx, ({ param }) => ({
      params: {
        position: param<number>({ default: 0.35, min: 0, max: 1 }),
        size: param<number>({ default: 0.37, min: 0, max: 1 }),
        density: param<number>({ default: 0.51, min: 0, max: 1 }),
        spray: param<number>({ default: 0.3, min: 0, max: 1 }),
        pitch: param<number>({ default: 0, min: -12, max: 12 }),
        playhead: param<number>({ default: 0, min: 0, max: 1 }),
        reverse: param<boolean>({ default: false }),
        octave: param<number>({ default: 0, min: 0, max: 1 }),
        level: param({ default: 0.8, bind: out.gain }),
      },
      latency: 0,
    }));
    this._out = out;
    this.rng = createRng(seed);
  }

  get output() {
    return this._out;
  }

  get buffer() {
    return this._buffer;
  }
  set buffer(b: AudioBuffer | null) {
    this._buffer = b;
    this._reversed = null;
  }

  get activeGrains() {
    return this.active;
  }

  reseed(seed: number) {
    this.rng = createRng(seed);
  }

  /** Creates every grain whose start time falls before `until` (context seconds). */
  scheduleUntil(until: number) {
    const buffer = this._buffer;
    if (!buffer) return;
    const p = this.params, reversed = p.reverse.value;
    if (reversed && !this._reversed) this._reversed = reverseBuffer(buffer);
    const source = reversed ? this._reversed! : buffer;
    if (this.nextTime < this.context.currentTime) this.nextTime = this.context.currentTime + 0.01;
    while (this.nextTime < until) {
      const settings = { position: p.playhead.value + p.position.value, size: p.size.value, density: p.density.value, spray: p.spray.value, pitch: p.pitch.value, octave: p.octave.value };
      const plan = planGrain(settings, buffer.duration, this.rng, reversed);
      if (this.active < MAX_GRAINS) {
        this.spawn(source, plan, this.nextTime);
        this.onGrain?.({ when: this.nextTime, plan, reversed, voice: this.voice });
      }
      this.nextTime += nextInterval(p.density.value, this.rng);
    }
  }

  /** Plays one logged grain at `when`, without planning or limits. Used to replay a take. */
  playGrain(plan: GrainPlan, when: number, reversed: boolean) {
    if (!this._buffer) return;
    if (reversed && !this._reversed) this._reversed = reverseBuffer(this._buffer);
    this.spawn(reversed ? this._reversed! : this._buffer, plan, when);
  }

  /** Starts the live scheduling timer. Offline renders call `scheduleUntil` themselves instead. */
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.context.state === "running") this.scheduleUntil(this.context.currentTime + LOOKAHEAD);
    }, TICK_MS);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private spawn(buffer: AudioBuffer, g: GrainPlan, when: number) {
    const ctx = this.context;
    const src = new AudioBufferSourceNode(ctx, { buffer, playbackRate: g.rate });
    const env = new GainNode(ctx, { gain: 0 });
    const pan = new StereoPannerNode(ctx, { pan: g.pan });
    src.connect(env);
    env.connect(pan);
    pan.connect(this._out);
    env.gain.setValueAtTime(0, when);
    env.gain.setValueCurveAtTime(this.window.map((v) => v * g.gain), when, g.duration);
    this.active++;
    src.onended = () => {
      this.active--;
      src.disconnect(); env.disconnect(); pan.disconnect();
    };
    src.start(when, g.offset, g.sourceSeconds);
  }

  destroy() {
    this.stop();
    super.destroy();
  }
}
