import { AudioProcessor, BufferPlayer, type SchedulableParam } from "@audiorective/core";
import { Convolver, Distortion, FrequencyShifter } from "@audiorective/effects";
import { GranularCloud } from "./GranularCloud";
import { HitVoice } from "./HitVoice";
import { ROOMS, generateIr, sampleIr, type RoomId } from "./rooms";

/** The audio-rate controls the instrument drives. A take logs values per key so an offline render can replay them. */
export type ControlKey = "cloud" | "slow" | "rate" | "cutoff" | "drive" | "makeup" | "shift" | "spectral" | "space" | "dry";
export interface Settable {
  setTargetAtTime(value: number, startTime: number, timeConstant: number): unknown;
  setValueAtTime(value: number, startTime: number): unknown;
}

/**
 * The sound path, built the same way live and in an offline render:
 *
 *   cloud + slow player -> source -+-> drive -------------+-> make-up -> low-pass -+-> dry ---+-> master -> limiter
 *                                  +-> frequency shifter --+                         +-> room --+
 *   gesture hits ----------------------------------------------------------------------+ (hits also feed the room)
 */
export class Voices extends AudioProcessor<{ master: SchedulableParam }> {
  readonly cloud: GranularCloud;
  readonly player: BufferPlayer;
  readonly hit: HitVoice;
  private readonly filter: BiquadFilterNode;
  private readonly drive: Distortion;
  private readonly shifter: FrequencyShifter;
  private readonly verb: Convolver;
  private readonly specGain: GainNode;
  private readonly verbGain: GainNode;
  private readonly dryGain: GainNode;
  private readonly makeup: GainNode;
  private readonly _out: AudioNode;
  private irCache = new Map<string, AudioBuffer>();

  constructor(ctx: BaseAudioContext, seed: number) {
    const cloud = new GranularCloud(ctx, seed);
    const player = new BufferPlayer(ctx, { loop: true, volume: 0, playbackRate: 0.25 });
    const hit = new HitVoice(ctx);
    const source = new GainNode(ctx);
    const drive = new Distortion(ctx, { distortion: 0.75 });
    drive.params.wet.value = 0;
    const shifter = new FrequencyShifter(ctx, { frequency: 100 });
    const specGain = new GainNode(ctx, { gain: 0 });
    const bus = new GainNode(ctx);
    const makeup = new GainNode(ctx); // evens out the level Drive adds
    const filter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 8000, Q: 0.7 });
    const dryGain = new GainNode(ctx, { gain: 0.7 });
    const verb = new Convolver(ctx);
    const verbGain = new GainNode(ctx, { gain: 0 });
    const master = new GainNode(ctx, { gain: 0.8 });
    const limiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 0, ratio: 20, attack: 0.003, release: 0.12 });
    super(ctx, ({ param }) => ({ params: { master: param({ default: 0.8, bind: master.gain }) }, latency: 0 }));
    this.cloud = cloud; this.player = player; this.hit = hit;
    this.filter = filter; this.drive = drive; this.shifter = shifter; this.verb = verb;
    this.specGain = specGain; this.verbGain = verbGain; this.dryGain = dryGain; this.makeup = makeup;
    this._out = limiter;
    this.defineGraph(() => [
      [cloud, source], [player, source],
      [source, drive], [source, shifter],
      [drive, bus], [shifter, specGain], [specGain, bus],
      [bus, makeup], [makeup, filter],
      [filter, dryGain], [dryGain, master],
      [filter, verb], [verb, verbGain], [verbGain, master],
      [hit, master], [hit, verb],
      [master, limiter],
    ]);
  }

  get output() {
    return this._out;
  }

  get control(): Record<ControlKey, Settable> {
    return {
      cloud: this.cloud.params.level, slow: this.player.params.volume, rate: this.player.params.rate, cutoff: this.filter.frequency,
      drive: this.drive.params.wet, makeup: this.makeup.gain, shift: this.shifter.params.frequency, spectral: this.specGain.gain, space: this.verbGain.gain, dry: this.dryGain.gain,
    };
  }

  /** Points the sources at a buffer, (re)starts the slow player at `playerOffset` seconds, and re-picks the hit material. */
  setBuffer(buffer: AudioBuffer, playerOffset = 0, when = this.context.currentTime) {
    this.cloud.buffer = buffer;
    this.player.stop();
    this.player.buffer = buffer;
    this.player.start(when, playerOffset);
    this.hit.setSource(buffer);
    this.irCache.delete("sample");
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
    this.player.destroy();
    this.hit.destroy();
    super.destroy();
  }
}
