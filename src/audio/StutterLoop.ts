import { AudioProcessor, type SchedulableParam } from "@audiorective/core";

/**
 * Repeats the last moment of whatever passes through, for the whole sound. A delay line always holds the last
 * `seconds` of input; switching to loop mode shuts the input to the line and feeds its output back into it, so that
 * slice repeats. `wet` and `dry` blend the loop with the live sound. All four controls are plain AudioParams, so a
 * take can replay them.
 *
 * The feedback cycle is wired with native connects on purpose: it is internal to this unit, and the unit declares
 * zero latency (a delay here is musical, not processing latency).
 */
export class StutterLoop extends AudioProcessor<{ inGain: SchedulableParam; feedback: SchedulableParam; wet: SchedulableParam; dry: SchedulableParam }> {
  private readonly _in: GainNode;
  private readonly _out: GainNode;

  constructor(ctx: BaseAudioContext, seconds: number) {
    const input = new GainNode(ctx);
    const output = new GainNode(ctx);
    const inGain = new GainNode(ctx, { gain: 1 });
    // A feedback cycle in Web Audio adds one render quantum (128 frames) on top of the delay time, so take it off to
    // make the loop exactly `seconds` long.
    const quantum = 128 / ctx.sampleRate;
    const delay = new DelayNode(ctx, { maxDelayTime: seconds + 0.05, delayTime: Math.max(quantum, seconds - quantum) });
    const feedback = new GainNode(ctx, { gain: 0 });
    const wet = new GainNode(ctx, { gain: 0 });
    const dry = new GainNode(ctx, { gain: 1 });
    super(ctx, ({ param }) => ({
      params: {
        inGain: param({ default: 1, bind: inGain.gain }),
        feedback: param({ default: 0, bind: feedback.gain }),
        wet: param({ default: 0, bind: wet.gain }),
        dry: param({ default: 1, bind: dry.gain }),
      },
      latency: 0,
    }));
    this._in = input;
    this._out = output;
    input.connect(dry); dry.connect(output);
    input.connect(inGain); inGain.connect(delay);
    delay.connect(feedback); feedback.connect(delay);
    delay.connect(wet); wet.connect(output);
  }

  get input() {
    return this._in;
  }
  get output() {
    return this._out;
  }
}
