# Generator

Browser instrument for evolving soundscapes from uploaded samples (granular, spectral,
physics-driven), with risers/drops, modulation, and WAV export. Built on Audiorective
(`@audiorective/*`). See `PLAN.md` for phases and architecture.

## Layout

- `PLAN.md` — feature plan and phases.
- `src/` — the React app (Vite + TypeScript). `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`.
  - `src/audio/` — audio layer: `Instrument` (an `AudioProcessor` holding all params, orb, gestures, sample, and the
    signal chain), `GranularCloud` (grain scheduler; `scheduleUntil` is the only place grains are made, so live and
    offline renders share it), pure modules (`granularMath`, `modulation`, `gesture`, `rng`, `sample`, `params`) with
    Vitest tests, and `engine.ts` (client-only `createEngine`).
  - Signal chain (`Voices.ts`, shared by live and offline). Four layers feed one source: grain cloud, slow loop
    (BufferPlayer, rate 0.25, plays backwards when Reverse is on), drone (a second `GranularCloud` with very long
    overlapping grains an octave down, first version), and the Spectral layer (a frequency-shifted copy of the other
    three, level and shift both follow the Spectral knob). Source -> drive (Distortion `wet` is the amount, with level
    make-up) -> 24 dB/oct low-pass (Filter, 25 Hz to 20 kHz) -> an equal-power crossfade between the layers' dry sound and
    the convolver room (Space is also the Room's DRY WET slider, the same param) -> Dry/Wet gain -> master -> whole-sound
    stutter loop (`StutterLoop.ts`) -> limiter. The original sample (`original` player, normal speed, unprocessed) joins at
    master, and gesture hits (`HitVoice.ts`) join there too and also feed the room.
  - Mix model (`mix.ts`): each big knob is one layer's level (`SCALE` holds the measured per-layer gains). DRY WET is an
    equal-power crossfade between the original sample (Dry) and everything generated (Wet). Space is an equal-power
    crossfade between the layers dry and the room. Layer meters and the output meter are real (analysers), not placeholders.
  - Ranges: grain size 10 ms to 4 s, density 1 to 200 grains per second (grain cap 160 per cloud).
  - Rooms (`rooms.ts`): six generated rooms (small, plate, hall, cathedral, cave, metal tank) plus "Your sample" (the
    first 4 s of the loaded sample, DC removed, soft edges, stereo). Chosen with the room picker in the Voices panel.
    A take keeps the room it started with.
  - Gesture hits: Riser plays a reversed swell, Drop plays the impact, Riser -> drop plays both. The hit is the loudest
    ~0.5 s of your sample, an octave down, plus a sub boom. Scheduled on the audio clock in `Instrument.fire`.
  - Performance knobs: Scatter, Octave and Stutter are tap-on/off buttons with an amount (starts at 50% every time it is
    turned on; drag up or down on the button to change it; the ring shows the level). Scatter adds spray and density to the
    grains, Octave is the share of grains an octave up, Stutter loops the last sixteenth note (at `BPM`) of the whole
    sound and the amount is the loop against the live sound. Freeze stops the head the grains read from (cloud and drone);
    the slow loop keeps moving, because freezing a sample at one instant has no sound.
  - The head the grains and the drone read from (the marker on the orb ring) normally IS the position of the original-sample
    loop, read off the audio clock (`live.transport`), so the soundscape smears around the exact moment you hear in the
    original; Position is an offset from it (default 0 = the same moment). Grains are read `GRAIN_LEAD` (0.1 s, measured)
    ahead of the head because they are planned that long before they sound. Freeze holds the head while the original carries
    on, Reverse runs it backwards and plays grains from a reversed buffer; when either ends the head snaps back to the
    original. Audio starts on the first click (AudioContext autoplay policy).
  - `src/midi/` — Web MIDI input with learn (`MidiManager`) and pure decoding (`bindings.ts`, tested).
  - `src/ui/` — React components (Knob, Orb, Canvases, Panels, TopBar, App). UI reads params with `useValue`
    and writes `param.value` or calls `Instrument` methods; it never schedules audio.
- `design/prototype/` — original static visual prototype, kept as the visual reference. The 1440×900
  stage is scaled to fit the window (the React app does the same).
- `design/tokens.css` — design tokens (source of truth); `design/DESIGN-SYSTEM.md` — principles,
  components, motion, accessibility, writing. The React app imports `design/tokens.css` in `src/main.tsx`; canvas code reads tokens through
  `src/ui/theme.ts`. Keep tokens.css and
  DESIGN-SYSTEM.md in sync; renaming a token is a breaking change.

## UI direction

Dark dusk palette (violet to amber), a large circular modulation orb (XY puck driving
several params at once) with a radial waveform of the uploaded sample, single-parameter
knobs arced around it, side panels, gesture (riser/drop) panel and performance buttons below.

## Rules

- UI uses semantic tokens only; no new hex values in CSS (canvas code reads tokens at startup).
- Audio logic lives in `AudioProcessor` subclasses; UI only reads/writes params.
- All randomness goes through one seeded RNG; log events so offline renders match live.
- Canvas animations compute their age with `progress()` (`src/ui/anim.ts`, clamped to 0..1): a frame timestamp can be a few
  ms older than an event stamped with `performance.now()`, and a negative canvas radius throws. The shared frame loop
  (`frameBus.ts`) also catches errors per callback, so one failing view can't freeze the others.
- Messages: `toast(text)` for info, `toast(text, "error")` for failures (larger, red, stays 7 s). `ToastView` lives inside the
  scaled stage, so it grows with the screen.
- Keyboard and MIDI target the same control ids (`NumericId` in `src/audio/params.ts`); add new knobs there so
  keyboard, MIDI learn and the UI stay in step.

## WAV export (`src/audio/export/`)

- REC captures the master output with an AudioWorklet (`recorder.ts`, exact PCM, node loaded once when audio starts so
  the first take doesn't glitch) and downloads a 24-bit stereo WAV (`wav.ts`) when stopped. Needs audio running.
- A take (`take.ts`) also logs every grain created (`GranularCloud.onGrain`), every gesture hit (`HitVoice.onHit`), every
  control value sent to the graph (`Instrument.send`), the seed, the room, the sample, the slow loop's position and
  direction and the original loop's position at the first captured frame
  (`playerClock.ts`, closed-form from the logged rate curves).
- Export WAV re-renders the last take offline (`render.ts`, `Voices` in an `OfflineAudioContext`, 3 s pre-roll, rounded to whole render quanta,
  so grains and tails that began before REC still sound). Cloud alone is sample-exact vs the live capture. With the slow layer and
  limiter the render tracks the live capture closely (correlation about 0.95 to 0.99), not sample-identical, because the
  compressor carries history the render can't see.
- Anything that changes sound must go through `Instrument.send`, `GranularCloud.onGrain` (both clouds) or `HitVoice.onHit`, or a take
  can't replay it. Do not replace those hooks (tests that need grains should wrap, not overwrite, `onGrain`).
- Replay accuracy depends on three timing rules, each found by measurement: control changes are scheduled 20 ms ahead
  and logged at that time (`CONTROL_LEAD`); the slow player starts at an explicit time aligned to a 128-frame render
  quantum and its rate is never scheduled before that; the loop position at the first captured frame comes from the
  logged rate curves (`playerClock.ts`). Measured live vs offline per half second: cloud alone about 0.99, with all
  layers and effects mostly 0.93 to 0.99, with dips to about 0.75 at a gesture's impact (compressor history).
- The render's pre-roll must be a whole number of 128-frame render quanta: the engine starts sources on quantum boundaries
  and the recorder starts on one, so a fractional pre-roll shifted some sources (the drone) by 2 quanta (5.8 ms) in the
  first take after a page load. It must also cover the longest grain (the drone's, 2.6 s).
- Room changes and Reverse toggles mid-take are heard live but the render keeps the starting room and slow direction.

## Keyboard

Orb focused: arrows move 2% (Shift ×5, Alt ×0.25), Home recentres. Anywhere: F fire, E evolve, Z freeze,
R reverse, 1/2/3 gesture type, Esc cancels MIDI learn.

## MIDI

Web MIDI (Chrome/Edge). Default map: Push-style encoders CC 71–78 (relative) to orb X, orb Y, position, size,
density, spray, pitch, filter. Learn: MIDI, then Learn, click a knob (or the orb for X then Y), move a control.
Bindings persist in localStorage. Not yet verified against Push hardware.
