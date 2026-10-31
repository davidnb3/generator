import { useRef } from "react";
import { type EngineState } from "@audiorective/core";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";
import { useMidi, useToast } from "./context";
import { useFrame } from "./frameBus";

const { instrument } = engine;

function Midi() {
  const { manager, learnMode, setLearnMode, state } = useMidi();
  const ready = state.status === "ready";
  const title = ready ? (state.inputs.length ? state.inputs.join(", ") : "No MIDI inputs found") : state.status === "unsupported" ? "This browser has no Web MIDI. Use Chrome or Edge." : state.status === "denied" ? "MIDI access was blocked in the browser." : "Connect MIDI";
  return (
    <div className="midi">
      <button className={`chip${ready ? " ready" : ""}`} title={title} aria-pressed={ready} onClick={() => (ready ? (manager.disable(), setLearnMode(false)) : void manager.enable())}>
        <i />MIDI{ready && ` · ${state.inputs.length}`}
      </button>
      {ready && (
        <>
          <button className="chip" aria-pressed={learnMode} onClick={() => { setLearnMode(!learnMode); manager.cancelLearn(); }}>Learn</button>
          {learnMode && <button className="chip" onClick={() => manager.resetBindings()}>Reset map</button>}
        </>
      )}
    </div>
  );
}

function AudioState() {
  const state = useValue(engine.core.state as () => EngineState); // SignalAccessor's overloads confuse useValue's inference
  if (state === "running") return null;
  return <button className="chip" onClick={() => void engine.core.start()}><i />Audio off · click to start</button>;
}

export function TopBar() {
  const toast = useToast();
  const seed = useValue(instrument.params.seed);
  const since = useValue(instrument.params.recordingSince);
  const rec = useRef<HTMLSpanElement>(null);
  useFrame((now) => {
    if (!rec.current) return;
    const s = instrument.params.recordingSince.value;
    if (s === null) { rec.current.textContent = "REC"; return; }
    const t = (now - s) / 1000;
    rec.current.textContent = `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;
  }, 2);
  return (
    <header id="top" className="enter" style={{ ["--d" as string]: 0 }}>
      <div className="brand">
        <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
          <circle cx="15" cy="15" r="11" fill="none" stroke="url(#gradVA)" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="58 12" transform="rotate(-70 15 15)" />
          <circle cx="15" cy="15" r="3" fill="#ffd08a" />
        </svg>
        <span>GENERATOR</span>
      </div>
      <div className="preset">
        <button className="icon-btn" aria-label="Previous preset">‹</button>
        <div className="preset-name"><b>Rain on tin</b><small>Dusk drift · 8 bars</small></div>
        <button className="icon-btn" aria-label="Next preset">›</button>
      </div>
      <div className="top-r">
        <AudioState />
        <Midi />
        <div className="stat"><small>BPM</small><b>84</b></div>
        <div className="stat"><small>SEED</small><b>{seed}</b></div>
        <button className="rec" aria-pressed={since !== null} onClick={() => {
          const secs = instrument.toggleRecording();
          if (secs !== null) toast(`Captured ${secs.toFixed(1)} s. Real WAV capture arrives with the audio engine.`);
        }}><i /><span ref={rec}>REC</span></button>
        <button className="btn-primary" onClick={() => toast("Offline render to WAV arrives with the audio engine.")}>Export WAV</button>
      </div>
    </header>
  );
}
