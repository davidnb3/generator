# Generator

Browser instrument for evolving soundscapes from uploaded samples (granular, spectral,
physics-driven), with risers/drops, modulation, and WAV export. Built on Audiorective
(`@audiorective/*`). See `PLAN.md` for phases and architecture.

## Layout

- `PLAN.md` — feature plan and phases.
- `src/` — the React app (Vite + TypeScript). `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`.
  - `src/audio/` — audio layer: `Instrument` (an `AudioProcessor` holding all params, orb, gestures, sample),
    pure modules (`modulation`, `gesture`, `rng`, `sample`, `params`) with Vitest tests, and `engine.ts`
    (client-only `createEngine`). No sound is produced yet.
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
- Keyboard and MIDI target the same control ids (`NumericId` in `src/audio/params.ts`); add new knobs there so
  keyboard, MIDI learn and the UI stay in step.

## Keyboard

Orb focused: arrows move 2% (Shift ×5, Alt ×0.25), Home recentres. Anywhere: F fire, E evolve, Z freeze,
R reverse, 1/2/3 gesture type, Esc cancels MIDI learn.

## MIDI

Web MIDI (Chrome/Edge). Default map: Push-style encoders CC 71–78 (relative) to orb X, orb Y, position, size,
density, spray, pitch, filter. Learn: MIDI, then Learn, click a knob (or the orb for X then Y), move a control.
Bindings persist in localStorage. Not yet verified against Push hardware.
