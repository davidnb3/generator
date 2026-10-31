import { createEngine } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { Instrument } from "./instrument";

// Client-only: createEngine builds a real AudioContext. Import this module only from the browser bundle.
export const engine = createEngine((ctx) => {
  const instrument = new Instrument(ctx);
  instrument.output.connect(ctx.destination);
  return { instrument };
});

export const { EngineProvider, useEngine } = createEngineContext(engine);
