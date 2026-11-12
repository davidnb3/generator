/** Records the exact PCM that passes a point in the graph, using an AudioWorklet (no compression, no resampling). */

const NAME = "grainwash-pcm-recorder";
const SOURCE = `
class Rec extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false; this.fill = 0; this.start = null; this.size = 4096;
    this.chunk = [new Float32Array(this.size), new Float32Array(this.size)];
    this.port.onmessage = (e) => {
      if (e.data === "start") { this.on = true; this.start = null; this.fill = 0; }
      else if (e.data === "stop") { this.flush(); this.on = false; this.port.postMessage({ done: true }); }
    };
  }
  flush() {
    if (!this.fill) return;
    const out = this.chunk.map((c) => c.slice(0, this.fill));
    this.port.postMessage({ chunk: out, startFrame: this.start }, out.map((c) => c.buffer));
    this.fill = 0;
  }
  process(inputs) {
    const inp = inputs[0];
    if (this.on && inp && inp.length) {
      if (this.start === null) this.start = currentFrame;
      const n = inp[0].length;
      for (let i = 0; i < n; i++) {
        this.chunk[0][this.fill] = inp[0][i];
        this.chunk[1][this.fill] = (inp[1] || inp[0])[i];
        if (++this.fill === this.size) this.flush();
      }
    }
    return true;
  }
}
registerProcessor("${NAME}", Rec);
`;

const loaded = new WeakSet<BaseAudioContext>();

export interface Recording { channels: Float32Array[]; sampleRate: number; startTime: number }

export class Recorder {
  private node: AudioWorkletNode | null = null;
  private chunks: [Float32Array[], Float32Array[]] = [[], []];
  private startFrame = 0;
  private onDone: (() => void) | null = null;
  private capturing = false;

  constructor(private readonly ctx: AudioContext, private readonly source: AudioNode) {}

  get recording() {
    return this.capturing;
  }

  /**
   * Loads the worklet and creates its node, which then stays connected (silent, and idle until a recording starts).
   * Doing this once, ahead of the first recording, keeps that work from glitching the live audio.
   */
  async prepare() {
    if (this.node) return;
    if (!this.ctx.audioWorklet) throw new Error("This browser has no AudioWorklet, so it can't record.");
    if (!loaded.has(this.ctx)) {
      const url = URL.createObjectURL(new Blob([SOURCE], { type: "text/javascript" }));
      try { await this.ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
      loaded.add(this.ctx);
    }
    if (this.node) return; // another caller finished first
    const node = new AudioWorkletNode(this.ctx, NAME, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    const sink = new GainNode(this.ctx, { gain: 0 }); // keeps the node pulled by the graph without making sound
    node.port.onmessage = (e: MessageEvent<{ done?: boolean; chunk?: Float32Array[]; startFrame?: number }>) => {
      if (e.data.chunk) {
        if (this.startFrame < 0 && e.data.startFrame != null) this.startFrame = e.data.startFrame;
        this.chunks[0].push(e.data.chunk[0]); this.chunks[1].push(e.data.chunk[1]);
      }
      if (e.data.done) this.onDone?.();
    };
    this.source.connect(node);
    node.connect(sink);
    sink.connect(this.ctx.destination);
    this.node = node;
  }

  async start() {
    if (this.capturing) return;
    await this.prepare();
    this.chunks = [[], []];
    this.startFrame = -1;
    this.capturing = true;
    this.node!.port.postMessage("start");
  }

  async stop(): Promise<Recording> {
    const node = this.node;
    if (!node || !this.capturing) throw new Error("Not recording.");
    const done = new Promise<void>((resolve) => (this.onDone = resolve));
    node.port.postMessage("stop");
    await done;
    this.capturing = false; this.onDone = null;
    const join = (parts: Float32Array[]) => {
      const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
      let at = 0;
      for (const p of parts) { out.set(p, at); at += p.length; }
      return out;
    };
    return { channels: [join(this.chunks[0]), join(this.chunks[1])], sampleRate: this.ctx.sampleRate, startTime: Math.max(0, this.startFrame) / this.ctx.sampleRate };
  }
}
