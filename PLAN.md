# Grainwash: plan

A browser instrument for evolving soundscapes built from the user's own samples.
Upload a sound, shape it with granular, spectral and physics-driven sources, add
modulation and randomness, fire risers and drops, and bounce everything to WAV for
a DAW. Inspired by Native Instruments' Kinetic Metal.

Status: Phases 0 and 1 done and the sound path is complete. Stage A of the soundscape work is in: layer levels, a true Dry/Wet against the original sample, a room Dry/Wet, tap-and-drag performance knobs, a whole-sound Stutter, a first drone voice, and real meters. Next: stage B (a spectral-stretch drone, bigger rooms with shimmer and freeze), stage C (tuned resonators, slow drifting movement), then Phase 3 physics scene, evolver macros, stems, data feeds.

## Stack

- Vite + React + TypeScript
- `@audiorective/core`, `@audiorective/clock`, `@audiorective/effects`, `@audiorective/react`
- Pixi.js (or Canvas2D) for the physics scene and waveform views; `matter-js` for physics
- Vitest for headless audio tests (processors run against a mock/offline context)

## Principles

1. **Audio layer owns audio.** All scheduling and automation are methods on `AudioProcessor`
   subclasses. UI reads and writes params only. Litmus test: runnable from a unit test with no DOM.
2. **Everything is reproducible.** One seeded RNG (`createRng(seed)`) is the only source of
   randomness. Every macro move, gesture and physics trigger is logged as timeline data, so an
   offline render matches what was heard.
3. **Live and offline share one graph.** Processors accept `BaseAudioContext`; export re-renders
   the same graph through `renderOffline` / `renderTimeline`.
4. **Client-only.** The engine is created inside a client-only boundary (no SSR).

## Architecture

```
src/
  audio/
    engine.ts            createEngine, wires the graph
    rng.ts               seeded RNG (mulberry32 or similar)
    timeline.ts          event log: { t, target, kind, value } + replay
    sources/
      GranularCloud.ts   grain scheduler: position, size, density, pitch, spray, jitter
      SlowPlayer.ts      BufferPlayer wrapper: slow/reverse/freeze
      HitSampler.ts      Sampler wrapper for physics/gesture hits
      SpectralLayer.ts   FrequencyShifter + Convolver(sample as IR) paths
    Layer.ts             source + effect chain + level/send
    Macro.ts             evolver: random walk / Markov on macro params
    Gesture.ts           riser(), drop(), riserThenDrop()
    DataFeed.ts          maps external values to params
    master.ts            Compressor/Limiter + recorder tap
    export/
      wav.ts             AudioBuffer -> 24-bit / float32 WAV
      render.ts          timeline -> renderOffline -> WAV (+ stems)
      recorder.worklet.ts live PCM capture
  ui/                    React views (no audio logic)
  physics/               matter-js scene, collision -> trigger mapping
  state/                 project save/load (JSON: seed, params, timeline, sample refs)
```

## Phases

### Phase 0: Foundation
- Vite/React/TS scaffold, lint, Vitest, the Audiorective packages, client-only engine island.
- Seeded RNG and timeline event log, with tests.
- Sample upload: drag/drop `File` -> `decodeAudioData`, waveform peaks, stored in memory
  (IndexedDB later).
- Done when: upload a file, see its waveform, play it through a `BufferPlayer`.

### Phase 1: Granular core and WAV export (first usable build)
- `GranularCloud` processor (position, size, density, pitch, spray, pan, envelope, freeze,
  reverse, grain cap).
- Waveform UI with a draggable read head and spray region.
- Master chain (limiter) and WAV export via offline render, plus live PCM recorder.
- Done when: a granular texture from an uploaded sample exports to WAV and the offline render
  matches the live seed.

### Phase 2: Gestures (risers and drops)
- `Gesture` methods: `riser`, `drop`, `riserThenDrop`, scheduled against the clock, landing on a
  bar line.
- Curves for grain density/size, rate, filter, reverb/delay wet, distortion, width, gain.
- Randomness: jitter, curve shapes per param, stutter/gate, reverse bursts, detune scatter; seed
  plus re-roll.
- Impact generation: find the loudest transient/spectral peak in the sample; reversed pre-hit.
- Triggers: pad, keyboard, MIDI (later), scheduled every N bars with probability.

### Phase 3: Physics scene
- matter-js world with draggable, bouncing objects.
- Mapping: collision position -> sample position, velocity -> grain level/brightness,
  height -> pitch, material -> hit slice.
- `HitSampler` triggers, polyphony caps, timeline logging.

### Phase 4: Evolver macros
- Macro params (density, tone, space, pitch scatter, energy).
- Random walk / Markov changes every N bars with ramps; mutate on a timer or physics energy.
- Resampling loop: record N bars, load back as a new source.

### Phase 5: Layers and spectral paths
- `Layer` abstraction: source + FX chain + level/send; mixer view.
- Spectral/weird paths: FrequencyShifter, sample-as-IR convolver, ultra-slow playback, reverse,
  feedback delay.
- Layer solo/mute, per-layer export stems.

### Phase 6: Data feeds
- `DataFeed` adapter (weather, markets, transit) -> normalized values -> macro params.
- Offline-safe: feeds recorded to the timeline so renders stay reproducible.

### Phase 7: Arrangement, projects, polish
- Timeline view of gestures and macro moves; bounce full timeline or per-layer stems.
- Project save/load (JSON + sample blobs), presets, undo.
- Accessibility pass, performance profiling, mobile layout decisions.

## Risks and decisions

| Risk | Mitigation |
|---|---|
| Grain node count hits CPU limits | Grain cap, envelope reuse, offline render as the heavy path |
| Offline render diverges from live | One RNG, event log, replay test comparing both |
| Stretch pitch engine needs worklet load | Await `ready`; default to `playbackRate` ramps |
| Live WAV capture quality | AudioWorklet PCM recorder, not `MediaRecorder` |
| Large samples in memory | Cap length, warn, downmix option; IndexedDB persistence |

## Open questions

- UI direction (see design inspiration; choose before Phase 0 UI work).
- Which data feed first, if any.
- MIDI input in scope for v1?
- Hosting target (static site is enough).

## Next steps

1. Pick a UI style.
2. Create the design system (tokens, components, docs) and save it in `design/`.
3. Start Phase 0.
