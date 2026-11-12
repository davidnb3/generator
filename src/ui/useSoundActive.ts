import { useValue } from "@audiorective/react";
import type { EngineState } from "@audiorective/core";
import { engine } from "../audio/engine";

/** True when there is a sound loaded and the audio is running: the orb only moves while something can be heard. */
export function useSoundActive() {
  const empty = useValue(engine.instrument.params.sample).empty;
  const state = useValue(engine.core.state as () => EngineState); // SignalAccessor's overloads confuse useValue's inference
  return !empty && state === "running";
}
