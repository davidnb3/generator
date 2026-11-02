import { AudioProcessor, reverseBuffer, type SchedulableParam } from "@audiorective/core";
import { findImpactStart } from "./rooms";

/** A gesture hit that was scheduled: when it starts (context seconds) and how long the swell runs. */
export interface HitEvent { when: number; kind: "swell" | "impact"; duration: number }

const SLICE_SECONDS = 0.9;

/**
 * The sound of a gesture: a reversed swell that builds into the hit, and the hit itself, taken from the loudest
 * moment of your sample, dropped an octave, with a sub boom underneath. Scheduling is explicit, so a take can replay it.
 */
export class HitVoice extends AudioProcessor<{ level: SchedulableParam }> {
  private readonly _out: GainNode;
  private slice: AudioBuffer | null = null;
  private reversed: AudioBuffer | null = null;
  /** Called for every hit that is scheduled; a recording uses it to log the take. */
  onHit: ((e: HitEvent) => void) | null = null;

  constructor(ctx: BaseAudioContext) {
    const out = new GainNode(ctx, { gain: 0.5 });
    super(ctx, ({ param }) => ({ params: { level: param({ default: 0.5, bind: out.gain }) }, latency: 0 }));
    this._out = out;
  }

  get output() {
    return this._out;
  }

  /** Picks the loudest part of the sample as the hit material. */
  setSource(buffer: AudioBuffer | null) {
    if (!buffer) { this.slice = this.reversed = null; return; }
    const start = findImpactStart(buffer.getChannelData(0), buffer.sampleRate);
    const len = Math.max(1, Math.min(buffer.length - start, Math.round(SLICE_SECONDS * buffer.sampleRate)));
    const slice = new AudioBuffer({ length: len, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const src = buffer.getChannelData(c), dst = slice.getChannelData(c), fade = Math.floor(len * 0.25);
      for (let i = 0; i < len; i++) {
        const w = i >= len - fade ? 0.5 + 0.5 * Math.cos((Math.PI * (i - (len - fade))) / fade) : 1;
        dst[i] = src[start + i] * w;
        peak = Math.max(peak, Math.abs(dst[i]));
      }
    }
    const k = peak > 0 ? 0.9 / peak : 1;
    for (let c = 0; c < slice.numberOfChannels; c++) { const d = slice.getChannelData(c); for (let i = 0; i < len; i++) d[i] *= k; }
    this.slice = slice;
    this.reversed = reverseBuffer(slice);
  }

  /** A reversed copy of the hit material, swelling in over `duration` seconds. */
  swell(when: number, duration: number) {
    if (!this.reversed) return;
    this.onHit?.({ when, kind: "swell", duration });
    this.playSwell(when, duration);
  }

  /** The hit: the slice an octave down, plus a sub boom. */
  impact(when: number) {
    if (!this.slice) return;
    this.onHit?.({ when, kind: "impact", duration: 0 });
    this.playImpact(when);
  }

  /** Replays a logged hit without logging it again. */
  replay(e: HitEvent) {
    if (e.kind === "swell") this.playSwell(e.when, e.duration);
    else this.playImpact(e.when);
  }

  private playSwell(when: number, duration: number) {
    const ctx = this.context, buf = this.reversed;
    if (!buf) return;
    const src = new AudioBufferSourceNode(ctx, { buffer: buf, playbackRate: buf.duration / duration });
    const g = new GainNode(ctx, { gain: 0.02 });
    src.connect(g); g.connect(this._out);
    g.gain.setValueAtTime(0.02, when);
    g.gain.exponentialRampToValueAtTime(1, when + duration);
    g.gain.setValueAtTime(0, when + duration + 0.005);
    src.onended = () => { src.disconnect(); g.disconnect(); };
    src.start(when);
  }

  private playImpact(when: number) {
    const ctx = this.context, buf = this.slice;
    if (!buf) return;
    const src = new AudioBufferSourceNode(ctx, { buffer: buf, playbackRate: 0.5 });
    const g = new GainNode(ctx, { gain: 1 });
    src.connect(g); g.connect(this._out);
    g.gain.setValueAtTime(1, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + buf.duration / 0.5);
    src.onended = () => { src.disconnect(); g.disconnect(); };
    src.start(when);

    const boom = new OscillatorNode(ctx, { type: "sine", frequency: 72 });
    const bg = new GainNode(ctx, { gain: 0.0001 });
    boom.connect(bg); bg.connect(this._out);
    boom.frequency.setValueAtTime(72, when);
    boom.frequency.exponentialRampToValueAtTime(36, when + 0.8);
    bg.gain.setValueAtTime(0.0001, when);
    bg.gain.exponentialRampToValueAtTime(0.9, when + 0.01);
    bg.gain.exponentialRampToValueAtTime(0.0001, when + 1.4);
    boom.onended = () => { boom.disconnect(); bg.disconnect(); };
    boom.start(when);
    boom.stop(when + 1.5);
  }
}
