# Generator design system

Version 0.1. Extracted from `design/prototype/`. Tokens live in [tokens.css](tokens.css) and are the source of truth; this document explains how to use them. Keep both in sync.

## 1. Principles

1. **The orb is the instrument.** One large modulation surface drives many parameters. Everything else is support and stays quiet.
2. **Violet is source, amber is movement.** Violet marks the sample, the cloud and static values. Amber marks modulation, playheads, spectral processing and anything that is moving or active.
3. **Show the sound.** Every state that has a sonic effect has a visible counterpart (waveform, grains, meters, curves).
4. **Glow, don't shadow.** The canvas is near-black, so depth comes from translucent panels, hairlines and glows.
5. **Motion has a job.** Animation explains cause and effect (a grain exits, a bar flares, a riser builds). Nothing animates just to decorate, and `prefers-reduced-motion` turns decoration off.

## 2. Tokens

### Color

| Token | Value | Use |
|---|---|---|
| `--bg` / `--canvas` | `#07060c` / `#0a0910` | Page and app background |
| `--panel-top` / `--panel-bot` | white 5% / 1.8% | Panel gradient fill |
| `--fill-well` | black 25% | Recessed areas (curve canvas) |
| `--fill-hover` | white 8% | Hover on ghost buttons |
| `--line` / `--line-strong` | white 8.5% / 16% | Hairlines / control borders |
| `--text` | `#ece8f5` | Primary text and values |
| `--text-2` | `#a099b8` | Labels, supporting text |
| `--muted` | `#625c78` | Hints, captions, disabled-looking meta |
| `--accent-cool` / `-hi` | `#8f74ff` / `#c3b2ff` | Source, cloud, selection |
| `--accent-warm` / `-hi` | `#f6a944` / `#ffd08a` | Modulation, active, spectral |
| `--danger` | `#ff6f91` | REC, mute, loudest meter segments |
| `--on-accent` | `#1a1020` | Text on gradient buttons |

Gradients: `--grad-cool`, `--grad-warm` (value fills, bars), `--grad-brand` (primary buttons, logo ring). Palette ramps (`--violet-500`, `--amber-500`, etc.) are layer 1: use them only inside token definitions or canvas code that can't read CSS variables.

Contrast: `--text` on panel is about 14:1, `--text-2` about 6.5:1, `--muted` about 3:1. `--muted` is for non-essential metadata only; never use it for anything the user must read.

### Typography

| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Brand | Sora | 14 | 500 | Tracking `0.32em`, uppercase |
| Value | JetBrains Mono | 15 | 500 | Stats (BPM, seed) |
| Body | Sora | 13 | 400/500 | Names, row titles |
| UI | Sora | 12 | 400 | Buttons, rows, helper text |
| Caption | Sora | 11 | 400 | Meta, drop hint |
| Label | JetBrains Mono | 10 to 10.5 | 400/500 | Uppercase, tracking `0.16 to 0.2em`, `--text-2` |
| Number | JetBrains Mono | 11 to 13 | 400 | Knob values, dB readouts |

Two weights only (400, 500). The Fire button is the single 600. Sentence case everywhere except mono labels, which are uppercase through CSS, not in the source text.

### Spacing, size, shape

4 px base: `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16 (panel padding), `--sp-5` 20 (section gap), `--sp-6` 24 (page gutter). Radii: `--r-xs` 7, `--r-sm` 10, `--r-md` 12, `--r-lg` 18 (panels), `--r-pill` for buttons.

The stage is a fixed `1440 x 900` design surface scaled to fit the window. Layout is absolute on that grid:

| Zone | x, y, w x h |
|---|---|
| Top bar | 24, 12, 1392 x 52 |
| Source panel | 24, 80, 260 x 560 |
| Orb stage | 300, 80, 840 x 560 (orb diameter 480, centered) |
| Voices panel | 1156, 80, 260 x 560 |
| Gesture panel | 24, 656, 736 x 224 |
| Performance panel | 776, 656, 640 x 224 |

### Motion

| Token | Value | Use |
|---|---|---|
| `--ease` | `cubic-bezier(.22,1,.36,1)` | All UI transitions (fast out, soft landing) |
| `--dur-fast` | 0.2s | Hover, press |
| `--dur-base` | 0.3s | Toggles, segmented selection, macro buttons |
| `--dur-enter` / `--stagger` | 0.7s / 90 ms | Panel entrance, each panel one step later |
| `--dur-halo` | 6s | Orb breathing loop |
| `--dur-shock` / `--dur-ripple` | 1300 / 1400 ms | Drop shockwave, puck ripple |

Press feedback is `scale(0.94 to 0.97)`. Hover lift is `translateY(-1px)` on buttons and `-2px` on macro buttons.

## 3. Components

### Panel
A glass card: 1 px `--line` border, `--r-lg`, vertical gradient from `--panel-top` to `--panel-bot`, 16 px padding. Starts with an `h4` section label (mono, uppercase, with a 6 px glowing dot). The dot is violet for source and sound-shaping sections and amber for modulation, layers and performance. Sub-sections are separated by 20 px, not by extra cards. Never nest panels.

### Knob
The core single-parameter control.

| Property | Values |
|---|---|
| `size` | 56 (gesture), 76 (ring), 108 (big macro) |
| `grad` | `V` (violet, source side) or `A` (amber, spectral/modulated side) |
| `value` | 0 to 1 base value |
| `ax`, `ay` | Depth (-1 to 1) of orb X and Y modulation. Both 0 means no modulation. |
| `fmt` | Display formatter (default 0 to 100) |

Anatomy: 270 degree track (from 135 to 405 degrees), value arc with gradient, body with indicator line, and a thin amber modulation arc and dot sitting just outside the track. The base value arc never moves with modulation; the amber arc and dot show where the orb is pushing it. That separation is the key idea: the user always sees the value they set and the value they are hearing.

| State | Visual | Behavior |
|---|---|---|
| Default | Track at 10% white | Drag up/down to change (180 px = full range) |
| Hover | Track brightens to 18% | Cursor `ns-resize` |
| Fine | Same | Hold Shift for about 3x finer steps |
| Modulated | Amber arc and dot | Driven by orb, gestures or evolve |
| Focus | 2 px violet ring | Arrow keys change by 2% |
| Reset | | Double-click returns to default |

Accessibility: `role="slider"`, `aria-valuemin/max/now` (0 to 100), `tabindex="0"`, label from the visible name. Value text sits under the label. Do not put a knob's only readout in the arc.

### Orb (modulation pad)
A 480 px circular XY surface (canvas, 560 px including glow) that moves a puck. X is Texture, Y is Energy; each axis drives several parameters with per-parameter depth (the mapping list in the Source panel mirrors it). Layers, from the inside out: influence glow around the puck, dotted guide rings and crosshair, tick ring, radial waveform ring of the loaded sample (amber behind the head, violet ahead), gradient outer ring that rotates slowly.

| State | Visual |
|---|---|
| Idle | Slow halo breathing, grains stream out from the puck |
| Dragging | Puck ring grows, ripple emitted, puck follows pointer |
| Evolve | Puck glides to new random targets every 2.8 to 6 s, emitting a ripple |
| Riser | Outer ring thickens and pulses, grain rate and speed rise, puck climbs to the upper right |
| Drop | Shockwave ring, radial flash, waveform bars flare |
| Frozen | Head stops, grain rate drops to 25% |

Grains are the sound made visible: a grain's exit point on the ring maps to a position in the sample, and the bar there flares. Colors: cream, violet and amber at about 45 / 35 / 20%.

Accessibility gap: the orb is pointer-only today. v0.2 must add arrow-key control (focusable, `role="application"` with a live readout) and a text readout of X and Y (the "Texture 62 / Energy 58" line is the start of it).

### Segmented control
Pill container (`--r-sm`, 3 px padding) with equal buttons, one selected. Selected state is a violet tint with a 1 px `--accent-cool-hi` inset ring. Use for mutually exclusive modes with 2 to 4 options (Riser, Drop, Riser → drop; 4, 8, 16 bars). Use a toggle, not a segmented control, for on/off.

### Switch
38 x 22 pill with a sliding thumb. Off: neutral thumb. On: amber border, amber thumb with glow. Use `button` with `aria-pressed` and an `aria-label`. For a binary setting that changes sound character (Reverse).

### Mini button (M)
24 px square, `--r-xs`. Pressed state fills `--danger` with dark text. Mute only.

### Macro button
62 px circular key with a 22 px line icon (1.6 px stroke) and a mono caption below. Active: amber icon and border, inner and outer amber glow, and an expanding ping ring every 2.2 s. Momentary actions (Re-roll, Resample) flash active for 0.5 to 0.7 s and show a toast. Toggles use `aria-pressed`.

### Primary button, Fire, Export
Pill, `--grad-brand`, dark text (`--on-accent`). One per view region: Export WAV in the top bar, Fire in the Gesture panel. Fire shows progress as a white 45% fill growing from the left across the gesture duration. Hover brightens by 8% and lifts 1 px; press scales to 0.97.

### REC button
Outlined pill with a rose dot. Recording: rose border, tinted fill, dot pulses outward, label shows `mm:ss.s`.

### Layer row
8 px dot, name, 70 px level meter, mute. Meter fill uses `--grad-cool`, or `--grad-warm` for the spectral layer.

### Meters
56 LED segments per channel. Color by position: violet to 60%, amber to 85%, rose above. The dB readout is mono, right-aligned, and always shown next to the meter because color alone is not enough.

### Drop zone
Dashed `--line-strong` border, `--r-md`. Shows file name, metadata, a mini waveform and the hint "Drop audio here or click to replace". Hover or drag-over: violet border and tint. Keyboard: Enter or Space opens the file picker.

### Gesture curves
Four curves over a bar grid (density, size, filter, space), each in its own color, with a playhead during a gesture. Randomness adds seeded jitter; Curve changes the exponent. The same seed must reproduce the same curves, because that is what offline export replays.

### Toast
Centered bottom pill, slides up 20 px and fades in over 0.4 s, auto-hides after 2.6 s. `role="status"`. Copy follows section 5.

## 4. Accessibility

- All controls reachable by keyboard; focus ring is 2 px `--accent-cool-hi` with 2 px offset.
- Knobs are sliders (`aria-valuenow`), toggles use `aria-pressed`, icon-only buttons have `aria-label`.
- Never rely on color alone: modulated knobs also show a dot position, meters also show dB, mode buttons also show text.
- Respect `prefers-reduced-motion`: entrance, halo, ping and REC pulse are disabled; gesture duration is shortened. The orb canvas should also lower grain count under reduced motion (v0.2).
- Minimum target size is 24 px (mini button); primary targets are 44 px or larger.
- Known gaps: orb keyboard control, `aria-live` readout for the orb, `--muted` text contrast on small captions.

## 5. Writing

Same voice as the product: plain, short, confident.

- Sentence case for everything visible. Mono labels are uppercased by CSS.
- Verb first for actions: "Export WAV", "Fire", "Re-roll". No terminal punctuation on labels; helper text and toasts end with a period only when they are full sentences.
- Say what happened, then what to do: "Couldn't decode that file. Try a WAV, MP3, or OGG."
- Parameter names are single nouns (Size, Density, Space). Never rename a parameter in the UI without renaming it in the audio layer.
- Avoid "successfully", "please", and exclamation marks.
- Units are always shown with numbers (`8.0 s`, `44.1 kHz`, `-9.4 dB`).

## 6. Using the system

```html
<link rel="stylesheet" href="design/tokens.css">
```

```css
/* good: semantic tokens */
.thing { color: var(--text-2); border: var(--bw) solid var(--line); border-radius: var(--r-md); }
/* bad: raw values */
.thing { color: #a099b8; border: 1px solid rgba(255,255,255,.085); border-radius: 12px; }
```

Canvas code can't read `var()` directly. Read tokens once with `getComputedStyle(document.documentElement).getPropertyValue("--accent-warm-hi")` at startup instead of repeating hex.

## 7. Audit of the prototype (v0.1)

| Area | Finding | Action |
|---|---|---|
| Colors | About 20 hex values in CSS, 16 in `app.js` canvas code | Canvas code should read tokens at startup (see section 6) |
| Type scale | 12 distinct font sizes (9 to 18 px) | Collapse to the 7 sizes above when the UI is rebuilt in React |
| Radii | 13 distinct values | Map to `--r-xs` to `--r-pill`; 6, 8, 11, 14, 17, 22 px are strays |
| Tokens | Palette and semantic tokens extracted into `tokens.css`; prototype now loads it and renamed variables (`--violet-400`, `--amber-200`, ...) | Done |
| Accessibility | Knobs and toggles are labelled; orb is not keyboard accessible | v0.2 |
| Naming | Mixed `k*` ids for knob hosts and `.mac`, `.mini` class names | Rename to BEM-style component names during React port |

Score: structure 8/10, token coverage 6/10, accessibility 6/10.

## 8. Next

1. Port components to React inside the real app, one file per component under `src/ui/`, reading `tokens.css`.
2. Add a living component page (all states side by side) so regressions are visible.
3. Add orb keyboard control and a reduced-motion grain budget.
4. Version this system: breaking token renames get a changelog entry and a migration note here.
