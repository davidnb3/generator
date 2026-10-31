import { AudioProcessor, BufferPlayer, type SchedulableParam } from "@audiorective/core";
import { GranularCloud } from "./GranularCloud";

/** The audio-rate controls the instrument drives. A take logs values per key so an offline render can replay them. */
export type ControlKey = "cloud" | "slow" | "rate" | "cutoff";
export interface Settable {
  setTargetAtTime(value: number, startTime: number, timeConstant: number): unknown;
  setValueAtTime(value: number, startTime: number): unknown;
}

/**
 * The sound path: granular cloud + slow looped player -> low-pass -> master -> limiter.
 * Built the same way live and in an offline render, so a re-render hears the same graph.
 */
export class Voices extends AudioProcessor<{ master: SchedulableParam }> {
  readonly cloud: GranularCloud;
  readonly player: BufferPlayer;
  private readonly filter: BiquadFilterNode;
  private readonly _out: AudioNode;

  constructor(ctx: BaseAudioContext, seed: number) {
    const cloud = new GranularCloud(ctx, seed);
    const player = new BufferPlayer(ctx, { loop: true, volume: 0, playbackRate: 0.25 });
    const mix = new GainNode(ctx);
    const filter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 8000, Q: 0.7 });
    const master = new GainNode(ctx, { gain: 0.8 });
    const limiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 0, ratio: 20, attack: 0.003, release: 0.12 });
    super(ctx, ({ param }) => ({ params: { master: param({ default: 0.8, bind: master.gain }) }, latency: 0 }));
    this.cloud = cloud;
    this.player = player;
    this.filter = filter;
    this._out = limiter;
    this.defineGraph(() => [[cloud, mix], [player, mix], [mix, filter], [filter, master], [master, limiter]]);
  }

  get output() {
    return this._out;
  }

  get control(): Record<ControlKey, Settable> {
    return { cloud: this.cloud.params.level, slow: this.player.params.volume, rate: this.player.params.rate, cutoff: this.filter.frequency };
  }

  /** Points both sources at a buffer and (re)starts the slow player at `playerOffset` seconds. */
  setBuffer(buffer: AudioBuffer, playerOffset = 0, when = this.context.currentTime) {
    this.cloud.buffer = buffer;
    this.player.stop();
    this.player.buffer = buffer;
    this.player.start(when, playerOffset);
  }

  destroy() {
    this.cloud.destroy();
    this.player.destroy();
    super.destroy();
  }
}
