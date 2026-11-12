import { AudioProcessor, BufferPlayer, reverseBuffer, type SchedulableParam } from "@audiorective/core";
import { Convolver, Distortion, FrequencyShifter } from "@audiorective/effects";
import { GranularCloud } from "./GranularCloud";
import { HitVoice } from "./HitVoice";
import { stutterInterval } from "./granularMath";
import { BPM } from "./params";
import { ROOMS, generateIr, sampleIr, type RoomId } from "./rooms";
import { StutterLoop } from "./StutterLoop";

/** The audio-rate controls the instrument drives. A take logs values per key so an offline render can replay them. */
export type ControlKey =
  | "cloud" | "drone" | "slow" | "rate" | "spectral" | "shift" | "drive" | "makeup" | "cutoff"
  | "dry" | "space" | "wet" | "original" | "stIn" | "stFb" | "stWet" | "stDry";
export interface Settable {
  setTargetAtTime(value: number, startTime: number, timeConstant: number): unknown;
  setValueAtTime(value: number, startTime: number): unknown;
}

const both = (a: Settable, b: Settable): Settable => ({
  setTargetAtTime: (v, t, tc) => { a.setTargetAtTime(v, t, tc); b.setTargetAtTime(v, t, tc); },
  setValueAtTime: (v, t) => { a.setValueAtTime(v, t); b.setValueAtTime(v, t); },
});

export interface StartOptions { when?: number; slowOffset?: number; originalOffset?: number; slowReversed?: boolean; empty?: boolean }

/**
 * The sound path, built the same way live and in an offline render.
 *
 *   layers:   grain cloud + slow player + drone -> source -+-> drive -------------+-> make-up -> low-pass
 *                                                          +-> frequency shifter -+   (shifted copy = the Spectral layer)
 *   room:     low-pass -> dry --------+  (an equal-power crossfade: Space moves from the dry sound to the room)
 *             low-pass -> room -------+-> Dry/Wet gain -+
 *   original: the unprocessed sample, looped ---------------+-> master -> stutter loop -> limiter
 *   hits:     gesture hits ---------------------------------+   (always heard; they also feed the room)
 */
export class Voices extends AudioProcessor<{ master: SchedulableParam }> {
  readonly cloud: GranularCloud;
  readonly drone: GranularCloud;
  readonly player: BufferPlayer; // the slow loop
  readonly original: BufferPlayer; // the sample as it is, at normal speed
  readonly hit: HitVoice;
  private readonly filter: BiquadFilterNode;
  private readonly filter2: BiquadFilterNode; // second stage: together 24 dB per octave
  private readonly drive: Distortion;
  private readonly shifter: FrequencyShifter;
  private readonly verb: Convolver;
  private readonly stutter: StutterLoop;
  private readonly specGain: GainNode;
  private readonly verbGain: GainNode;
  private readonly dryGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly makeup: GainNode;
  private readonly _out: AudioNode;
  private irCache = new Map<string, AudioBuffer>();
  private reversedCache = new WeakMap<AudioBuffer, AudioBuffer>();

  constructor(ctx: BaseAudioContext, seed: number) {
    const cloud = new GranularCloud(ctx, seed, "cloud");
    const drone = new GranularCloud(ctx, seed + 1, "drone");
    const player = new BufferPlayer(ctx, { loop: true, volume: 0, playbackRate: 0.25 });
    const original = new BufferPlayer(ctx, { loop: true, volume: 0, playbackRate: 1 });
    const hit = new HitVoice(ctx);
    const source = new GainNode(ctx);
    const drive = new Distortion(ctx, { distortion: 0.75 });
    drive.params.wet.value = 0;
    const shifter = new FrequencyShifter(ctx, { frequency: 100 });
    const specGain = new GainNode(ctx, { gain: 0 });
    const bus = new GainNode(ctx);
    const makeup = new GainNode(ctx); // evens out the level Drive adds
    const filter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 8000, Q: 0.7 });
    const filter2 = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 8000, Q: 0.7 });
    const dryGain = new GainNode(ctx, { gain: 0.8 });
    const verb = new Convolver(ctx);
    const verbGain = new GainNode(ctx, { gain: 0 });
    const wetGain = new GainNode(ctx, { gain: 1 });
    const master = new GainNode(ctx, { gain: 0.8 });
    const stutter = new StutterLoop(ctx, stutterInterval(BPM));
    const limiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 0, ratio: 20, attack: 0.003, release: 0.12 });
    super(ctx, ({ param }) => ({ params: { master: param({ default: 0.8, bind: master.gain }) }, latency: 0 }));
    this.cloud = cloud; this.drone = drone; this.player = player; this.original = original; this.hit = hit;
    this.filter = filter; this.filter2 = filter2; this.drive = drive; this.shifter = shifter; this.verb = verb; this.stutter = stutter;
    this.specGain = specGain; this.verbGain = verbGain; this.dryGain = dryGain; this.wetGain = wetGain; this.makeup = makeup;
    this._out = limiter;
    this.defineGraph(() => [
      [cloud, source], [drone, source], [player, source],
      [source, drive], [source, shifter],
      [drive, bus], [shifter, specGain], [specGain, bus],
      [bus, makeup], [makeup, filter], [filter, filter2],
      [filter2, dryGain], [dryGain, wetGain],
      [filter2, verb], [verb, verbGain], [verbGain, wetGain],
      [wetGain, master],
      [original, master],
      [hit, master], [hit, verb],
      [master, stutter], [stutter, limiter],
    ]);
  }

  get output() {
    return this._out;
  }

  /** The nodes whose level each layer meter shows (live use only). */
  get layerTaps(): AudioNode[] {
    return [this.cloud.output, this.player.output, this.drone.output, this.specGain];
  }

  get control(): Record<ControlKey, Settable> {
    return {
      cloud: this.cloud.params.level, drone: this.drone.params.level, slow: this.player.params.volume, rate: this.player.params.rate,
      spectral: this.specGain.gain, shift: this.shifter.params.frequency,
      drive: this.drive.params.wet, makeup: this.makeup.gain, cutoff: both(this.filter.frequency, this.filter2.frequency),
      dry: this.dryGain.gain, space: this.verbGain.gain, wet: this.wetGain.gain, original: this.original.params.volume,
      stIn: this.stutter.params.inGain, stFb: this.stutter.params.feedback, stWet: this.stutter.params.wet, stDry: this.stutter.params.dry,
    };
  }

  private reversedOf(buffer: AudioBuffer) {
    let r = this.reversedCache.get(buffer);
    if (!r) { r = reverseBuffer(buffer); this.reversedCache.set(buffer, r); }
    return r;
  }

  /** Points every source at a buffer, starts both loops, and re-picks the hit material. */
  setBuffer(buffer: AudioBuffer, o: StartOptions = {}) {
    const when = o.when ?? this.context.currentTime;
    // with no sound loaded, the clouds and the hit have nothing to read from, so they stay quiet and idle
    this.cloud.buffer = o.empty ? null : buffer;
    this.drone.buffer = o.empty ? null : buffer;
    this.restartSlow(buffer, when, o.slowOffset ?? 0, o.slowReversed ?? false);
    this.original.stop();
    this.original.buffer = buffer;
    this.original.start(when, o.originalOffset ?? 0);
    this.hit.setSource(o.empty ? null : buffer);
    this.irCache.delete("sample");
  }

  /** (Re)starts only the slow loop, forwards or backwards. */
  restartSlow(buffer: AudioBuffer, when: number, offset: number, reversed: boolean) {
    this.player.stop();
    this.player.buffer = reversed ? this.reversedOf(buffer) : buffer;
    this.player.start(when, offset);
  }

  /** Chooses the room. "sample" uses (the start of) the loaded sample as the impulse response. */
  setRoom(room: RoomId, sample: AudioBuffer | null) {
    const sr = this.context.sampleRate, key = room === "sample" ? "sample" : room;
    let ir = this.irCache.get(key);
    if (!ir) {
      let channels: Float32Array[];
      if (room === "sample") {
        if (!sample) return;
        channels = sampleIr(Array.from({ length: sample.numberOfChannels }, (_, c) => sample.getChannelData(c)), sample.sampleRate);
      } else {
        channels = generateIr(ROOMS.find((r) => r.id === room)!, sr);
      }
      ir = new AudioBuffer({ length: channels[0].length, numberOfChannels: 2, sampleRate: room === "sample" && sample ? sample.sampleRate : sr });
      channels.forEach((ch, c) => ir!.copyToChannel(ch as Float32Array<ArrayBuffer>, c));
      this.irCache.set(key, ir);
    }
    this.verb.buffer = ir;
  }

  destroy() {
    this.cloud.destroy();
    this.drone.destroy();
    this.player.destroy();
    this.original.destroy();
    this.hit.destroy();
    this.stutter.destroy();
    super.destroy();
  }
}
