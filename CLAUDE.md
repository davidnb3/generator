# Generator

Browser instrument for evolving soundscapes from uploaded samples (granular, spectral,
physics-driven), with risers/drops, modulation, and WAV export. Built on Audiorective
(`@audiorective/*`). See `PLAN.md` for phases and architecture.

## Layout

- `PLAN.md` — feature plan and phases (no app code yet).
- `design/prototype/` — static visual prototype (`index.html`, `styles.css`, `app.js`),
  no audio engine. The 1440×900
  stage is scaled to fit the window.
- `design/tokens.css` — design tokens (source of truth); `design/DESIGN-SYSTEM.md` — principles,
  components, motion, accessibility, writing. The prototype loads `../tokens.css`, so serve from
  `design/` (`python3 -m http.server` there, open `/prototype/index.html`). Keep tokens.css and
  DESIGN-SYSTEM.md in sync; renaming a token is a breaking change.

## UI direction

Dark dusk palette (violet to amber), a large circular modulation orb (XY puck driving
several params at once) with a radial waveform of the uploaded sample, single-parameter
knobs arced around it, side panels, gesture (riser/drop) panel and performance buttons below.

## Rules

- UI uses semantic tokens only; no new hex values in CSS (canvas code reads tokens at startup).
- Audio logic lives in `AudioProcessor` subclasses; UI only reads/writes params.
- All randomness goes through one seeded RNG; log events so offline renders match live.
