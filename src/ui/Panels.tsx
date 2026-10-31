import { useRef, useState } from "react";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";
import { GESTURE_BARS, MODULATED, type GestureType } from "../audio/params";
import { Meters, MiniWave, GestureCurves } from "./Canvases";
import { MacroButton, Panel, Segmented, Switch } from "./Controls";
import { useToast } from "./context";
import { useFrame } from "./frameBus";
import { Knob } from "./Knob";

const { instrument } = engine;
const p = instrument.params;

const MAP_ROWS: { axis: "x" | "y"; id: (typeof MODULATED)[number]["id"]; label: string }[] = [
  { axis: "x", id: "size", label: "Grain size" }, { axis: "x", id: "filter", label: "Filter" }, { axis: "x", id: "space", label: "Space" },
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
    toast(r.ok ? `Loaded ${r.sample.name}` : r.error);
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

export function VoicesPanel() {
  const reverse = useValue(p.reverse);
  const wet = useValue(p.wet);
  return (
    <Panel id="pRight" delay={3} style={{ left: 1156, top: 80, width: 260, height: 560 }} title={<><i className="dot" />Voices</>}>
      <div className="bigs">
        <Knob param={p.cloud} heardId="cloud" target="cloud" label="Cloud" size={108} big style={{ left: 2, top: 0, position: "absolute" }} />
        <Knob param={p.spectral} heardId="spectral" target="spectral" label="Spectral" size={108} big grad="A" style={{ left: 122, top: 0, position: "absolute" }} />
      </div>
      <div className="row-sw"><span>Reverse</span><Switch on={reverse} onChange={(v) => (p.reverse.value = v)} label="Reverse" /></div>
      <h4 className="sp"><i className="dot a" />Layers</h4>
      <Layer name="Grain cloud" level={0} mute={p.muteCloud} />
      <Layer name="Slow player" level={1} mute={p.muteSlow} />
      <Layer name="Spectral" warm level={2} mute={p.muteSpectral} />
      <div className="wet">
        <span>Dry</span>
        <input type="range" min={0} max={100} value={Math.round(wet * 100)} aria-label="Dry wet" style={{ ["--fill" as string]: `${wet * 100}%` }} onChange={(e) => (p.wet.value = +e.target.value / 100)} />
        <span>Wet</span>
      </div>
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
  const [flash, setFlash] = useState<string | null>(null);
  const db = useRef<HTMLSpanElement>(null);
  const momentary = (k: string, ms: number) => { setFlash(k); window.setTimeout(() => setFlash(null), ms); };
  const Btn = (kind: Parameters<typeof MacroButton>[0]["kind"], label: string, on: boolean, onClick: () => void) => <MacroButton kind={kind} label={label} on={on} onClick={onClick} />;
  return (
    <Panel id="pMacros" delay={5} style={{ left: 776, top: 656, width: 640, height: 224 }} title={<><i className="dot a" />Performance</>}>
      <div className="macros">
        {Btn("freeze", "Freeze", freeze, () => (p.freeze.value = !freeze))}
        {Btn("reverse", "Reverse", reverse, () => (p.reverse.value = !reverse))}
        {Btn("scatter", "Scatter", false, () => toast("Scatter arrives with the granular engine."))}
        {Btn("octave", "Octave", false, () => toast("Octave arrives with the granular engine."))}
        {Btn("stutter", "Stutter", false, () => toast("Stutter arrives with the granular engine."))}
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
