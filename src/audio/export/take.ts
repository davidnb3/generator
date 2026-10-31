import type { ControlKey } from "../Voices";
import type { GrainEvent } from "../GranularCloud";
import type { SampleInfo } from "../sample";

/** One value sent to the audio graph: where it went, what it was, and how it was smoothed. */
export interface ControlEvent { t: number; key: ControlKey; value: number; tc: number } // t: seconds since the take began

/**
 * Everything needed to re-render a recording: the sample, the seed, every grain that was created,
 * and every control value that was sent. The live capture (`pcm`) is what you heard.
 */
export interface Take {
  id: number;
  seed: number;
  sampleRate: number;
  t0: number; // context time of the first captured frame
  duration: number; // seconds
  sample: SampleInfo;
  playerPhase: number; // estimated slow-player position (seconds) at t0
  grains: GrainEvent[]; // `when` is absolute context time
  control: ControlEvent[];
  pcm: Float32Array[];
}
