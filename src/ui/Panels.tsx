import { useRef, useState } from "react";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";
import { GESTURE_BARS, MODULATED, type GestureType } from "../audio/params";
import { ROOM_CHOICES } from "../audio/rooms";
import { Meters, MiniWave, GestureCurves } from "./Canvases";
import type { Param } from "@audiorective/core";
import { MacroButton, MacroKnob, Panel, Segmented } from "./Controls";
import { useToast } from "./context";
import { useFrame } from "./frameBus";
import { Knob } from "./Knob";

const { instrument } = engine;
const p = instrument.params;

const MAP_ROWS: { axis: "x" | "y"; id: (typeof MODULATED)[number]["id"]; label: string }[] = [
  { axis: "x", id: "size", label: "Grain size" }, { axis: "x", id: "filter", label: "Filter" }, { axis: "x", id: "space", label: "Room mix" },
  { axis: "y", id: "density", label: "Density" }, { axis: "y", id: "pitch", label: "Pitch spread" }, { axis: "y", id: "drive", label: "Drive" },
];

function MapRow({ axis, label }: { axis: "x" | "y"; label: string }) {
  const bar = useRef<HTMLElement>(null);
  useFrame(() => {
    const v = axis === "x" ? (p.orbX.value + 1) / 2 : (1 - p.orbY.value) / 2;
    if (bar.current) bar.current.style.width = `${(Math.min(1, Math.max(0, v)) * 100).toFixed(1)}%`;
  });
  return (
    <div className="map"><span>{label}</span><div className={`bar${axis === "y" ? " a" : ""}`}><i ref={bar} /></div></div>
  );
}

export function SourcePanel() {
  const sample = useValue(p.sample);
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const load = async (f: File) => {
    const r = await instrument.loadSample(f);
    if (r.ok) toast(`Loaded ${r.sample.name}`);
    else toast(r.error, "error");
  };
  const meta = `${sample.duration.toFixed(1)} s · ${(sample.sampleRate / 1000).toFixed(1)} kHz · ${sample.channels === 1 ? "mono" : sample.channels === 2 ? "stereo" : `${sample.channels} ch`}${sample.synthetic ? " · demo" : ""}`;
  return (
    <Panel id="pSource" delay={1} style={{ left: 24, top: 80, width: 260, height: 560 }} title={<><i className="dot" />Source</>}>
      <div
        className={`drop${over ? " over" : ""}`} role="button" tabIndex={0} aria-label="Replace sample"
        onClick={() => file.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.current?.click(); } }}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }} onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void load(f); }}
      >
        <div className="drop-top">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2" /></svg>
          <div><b>{sample.name}</b><small>{meta}</small></div>
        </div>
        <MiniWave />
        <p>Drop audio here or click to replace</p>
      </div>
      <input type="file" ref={file} accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ""; }} />

      <h4 className="sp"><i className="dot a" />Orb mapping</h4>
      <div className="axis"><span className="tag">X</span><b>Texture</b></div>
      {MAP_ROWS.filter((r) => r.axis === "x").map((r) => <MapRow key={r.id} {...r} />)}
      <div className="axis"><span className="tag a">Y</span><b>Energy</b></div>
      {MAP_ROWS.filter((r) => r.axis === "y").map((r) => <MapRow key={r.id} {...r} />)}
    </Panel>
  );
}

function Layer({ name, warm, level, mute }: { name: string; warm?: boolean; level: number; mute: typeof p.muteCloud }) {
  const bar = useRef<HTMLDivElement>(null);
  const muted = useValue(mute);
  useFrame(() => { if (bar.current) bar.current.style.width = `${(instrument.live.level[level] * 100).toFixed(0)}%`; });
  return (
    <div className="layer">
      <i className={`dot${warm ? " a" : ""}`} /><span>{name}</span>
      <div className={`lm${warm ? " a" : ""}`}><i ref={bar} /></div>
      <button className="mini" aria-pressed={muted} aria-label={`Mute ${name.toLowerCase()}`} onClick={() => (mute.value = !muted)}>M</button>
    </div>
  );
}

/** A Dry/Wet slider. The labels stay "Dry" and "Wet"; what it mixes is named by the section it sits in. */
function DryWet({ param, label }: { param: Param<number>; label: string }) {
  const v = useValue(param);
  return (
    <div className="wet">
      <span>Dry</span>
      <input type="range" min={0} max={100} value={Math.round(v * 100)} aria-label={label} style={{ ["--fill" as string]: `${v * 100}%` }} onChange={(e) => (param.value = +e.target.value / 100)} />
      <span>Wet</span>
    </div>
  );
}

function RoomPicker() {
  const room = useValue(p.room);
  const sample = useValue(p.sample);
  const i = ROOM_CHOICES.findIndex((r) => r.id === room);
  const step = (d: number) => (p.room.value = ROOM_CHOICES[(i + d + ROOM_CHOICES.length) % ROOM_CHOICES.length].id);
  const current = ROOM_CHOICES[i];
  return (
    <div role="group" aria-label="Room">
      <div className="room">
        <button className="icon-btn" aria-label="Previous room" onClick={() => step(-1)}>‹</button>
        <div className="room-name" aria-live="polite">
          <small>Room</small>
          <b>{current.label}</b>
          {room === "sample" && <small>{sample.synthetic ? "demo texture" : sample.name}</small>}
        </div>
        <button className="icon-btn" aria-label="Next room" onClick={() => step(1)}>›</button>
      </div>
      <DryWet param={p.space} label="Room dry wet" />
    </div>
  );
}

export function VoicesPanel() {
  return (
    <Panel id="pRight" delay={3} style={{ left: 1156, top: 80, width: 260, height: 560 }} title={<><i className="dot" />Voices</>}>
      <div className="layer-knobs">
        <Knob param={p.cloud} heardId="cloud" target="cloud" label="Cloud" size={84} big />
        <Knob param={p.slow} heardId="slow" target="slow" label="Slow" size={84} big />
        <Knob param={p.drone} heardId="drone" target="drone" label="Drone" size={84} big />
        <Knob param={p.spectral} heardId="spectral" target="spectral" label="Spectral" size={84} big grad="A" />
      </div>
      <DryWet param={p.wet} label="Dry wet" />
      <h4 className="sp"><i className="dot a" />Layers</h4>
      <Layer name="Grain cloud" level={0} mute={p.muteCloud} />
      <Layer name="Slow player" level={1} mute={p.muteSlow} />
      <Layer name="Drone" level={2} mute={p.muteDrone} />
      <Layer name="Spectral" warm level={3} mute={p.muteSpectral} />
      <RoomPicker />
    </Panel>
  );
}

export function GesturePanel() {
  const type = useValue(p.gestureType);
  const bars = useValue(p.gestureBars);
  const progress = useValue(p.gestureProgress);
  return (
    <section className="panel enter" id="pGesture" style={{ ["--d" as string]: 4, left: 24, top: 656, width: 736, height: 224 }}>
      <div className="g-left">
        <h4><i className="dot" />Gesture <em>risers and drops</em></h4>
        <Segmented<GestureType> label="Gesture type" value={type} onChange={(v) => (p.gestureType.value = v)} options={[{ value: "riser", label: "Riser" }, { value: "drop", label: "Drop" }, { value: "both", label: "Riser → drop" }]} />
        <Segmented<number> small label="Length in bars" value={bars} suffix="bars" onChange={(v) => (p.gestureBars.value = v)} options={GESTURE_BARS.map((b) => ({ value: b, label: String(b) }))} />
        <div className="g-knobs">
          <Knob param={p.random} target="random" label="Random" size={56} style={{ position: "absolute", left: 0, top: 0 }} />
          <Knob param={p.shape} target="shape" label="Curve" size={56} grad="A" style={{ position: "absolute", left: 72, top: 0 }} />
        </div>
        <button className="fire" onClick={() => instrument.fire()} style={{ ["--p" as string]: progress }}><span>Fire</span></button>
      </div>
      <GestureCurves />
    </section>
  );
}

export function PerformancePanel() {
  const toast = useToast();
  const evolve = useValue(p.evolve), freeze = useValue(p.freeze), reverse = useValue(p.reverse);
  const scatter = useValue(p.scatter), octave = useValue(p.octave), stutter = useValue(p.stutter);
  const scatterAmt = useValue(p.scatterAmt), octaveAmt = useValue(p.octaveAmt), stutterAmt = useValue(p.stutterAmt);
  const toggleWithAmount = (on: Param<boolean>, amount: Param<number>) => { if (!on.value) amount.value = 0.5; on.value = !on.value; };
  const [flash, setFlash] = useState<string | null>(null);
  const db = useRef<HTMLSpanElement>(null);
  const momentary = (k: string, ms: number) => { setFlash(k); window.setTimeout(() => setFlash(null), ms); };
  const Btn = (kind: Parameters<typeof MacroButton>[0]["kind"], label: string, on: boolean, onClick: () => void) => <MacroButton kind={kind} label={label} on={on} onClick={onClick} />;
  return (
    <Panel id="pMacros" delay={5} style={{ left: 776, top: 656, width: 640, height: 224 }} title={<><i className="dot a" />Performance</>}>
      <div className="macros">
        {Btn("freeze", "Freeze", freeze, () => (p.freeze.value = !freeze))}
        {Btn("reverse", "Reverse", reverse, () => (p.reverse.value = !reverse))}
        <MacroKnob kind="scatter" label="Scatter" on={scatter} amount={scatterAmt} onToggle={() => toggleWithAmount(p.scatter, p.scatterAmt)} onAmount={(v) => (p.scatterAmt.value = v)} />
        <MacroKnob kind="octave" label="Octave" on={octave} amount={octaveAmt} onToggle={() => toggleWithAmount(p.octave, p.octaveAmt)} onAmount={(v) => (p.octaveAmt.value = v)} />
        <MacroKnob kind="stutter" label="Stutter" on={stutter} amount={stutterAmt} onToggle={() => toggleWithAmount(p.stutter, p.stutterAmt)} onAmount={(v) => (p.stutterAmt.value = v)} />
        {Btn("evolve", "Evolve", evolve, () => (p.evolve.value = !evolve))}
        {Btn("resample", "Resample", flash === "resample", () => { momentary("resample", 700); toast("Resample: last 8 bars captured as a new source (prototype)"); })}
        {Btn("reroll", "Re-roll", flash === "reroll", () => { momentary("reroll", 500); instrument.setSeed((Math.random() * 9000 + 1000) | 0); })}
      </div>
      <div className="out">
        <span className="lbl">OUT</span>
        <Meters dbRef={db} />
        <span className="db" ref={db}>-9.0 dB</span>
      </div>
    </Panel>
  );
}
