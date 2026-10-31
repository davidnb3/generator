import { useEffect } from "react";
import { useValue } from "@audiorective/react";
import type { EngineState } from "@audiorective/core";
import { engine, EngineProvider } from "../audio/engine";
import { GESTURE_TYPES } from "../audio/params";
import { Knob } from "./Knob";
import { Orb } from "./Orb";
import { GesturePanel, PerformancePanel, SourcePanel, VoicesPanel } from "./Panels";
import { TopBar } from "./TopBar";
import { MidiProvider, StageScale, ToastProvider, useMidi, useStageFit } from "./context";

const { instrument } = engine;
const p = instrument.params;

const RING = [
  { id: "position", side: -1, row: 0 }, { id: "size", side: -1, row: 1 }, { id: "density", side: -1, row: 2 }, { id: "spray", side: -1, row: 3, grad: "A" },
  { id: "pitch", side: 1, row: 0 }, { id: "filter", side: 1, row: 1, grad: "A" }, { id: "space", side: 1, row: 2, grad: "A" }, { id: "drive", side: 1, row: 3, grad: "A" },
] as const;
const DY = [-175, -70, 70, 175];
const LABELS = Object.fromEntries([["position", "Position"], ["size", "Size"], ["density", "Density"], ["spray", "Spray"], ["pitch", "Pitch"], ["filter", "Filter"], ["space", "Space"], ["drive", "Drive"]]);

function Shortcuts() {
  const { setLearnMode, manager } = useMidi();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || t.closest("input, textarea, select")) return;
      if ((e.key === " " || e.key === "Enter") && t.closest("button, [role=button]")) return;
      const k = e.key.toLowerCase();
      if (k === "f") instrument.fire();
      else if (k === "e") p.evolve.value = !p.evolve.value;
      else if (k === "z") p.freeze.value = !p.freeze.value;
      else if (k === "r") p.reverse.value = !p.reverse.value;
      else if (k === "1" || k === "2" || k === "3") p.gestureType.value = GESTURE_TYPES[+k - 1];
      else if (k === "escape") { setLearnMode(false); manager.cancelLearn(); }
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [setLearnMode, manager]);
  return null;
}

/** Prepares recording as soon as audio is running, so the first take doesn't pay for loading the worklet. */
function RecorderWarmup() {
  const state = useValue(engine.core.state as () => EngineState);
  useEffect(() => {
    if (state === "running") instrument.prepareRecording().catch(() => undefined);
  }, [state]);
  return null;
}

function Stage() {
  const { learnMode, state } = useMidi();
  return (
    <section id="stage" className="enter" style={{ ["--d" as string]: 2, left: 300, top: 80, width: 840, height: 560 }}>
      <div className="halo" />
      <div style={{ position: "absolute", left: 140, top: 0, width: 560, height: 560 }}><Orb /></div>
      {RING.map((r) => {
        const dy = DY[r.row], x = 420 + r.side * Math.sqrt(340 * 340 - dy * dy);
        return (
          <Knob key={r.id} param={p[r.id]} heardId={r.id} target={r.id} label={LABELS[r.id]} grad={"grad" in r ? r.grad : "V"} style={{ position: "absolute", left: x - 38, top: 280 + dy - 42 }} />
        );
      })}
      <div className="ax ax-y">ENERGY</div>
      <div className="ax ax-x">TEXTURE</div>
      <div className="keys" aria-hidden="true"><b>Orb</b> arrows · Shift ×5 · Alt fine · Home centre<br /><b>Keys</b> F fire · E evolve · Z freeze · R reverse · 1 2 3</div>
      {learnMode && <div className="learn-banner" role="status">{state.learning ? `Move a MIDI control for ${p[state.learning].label ?? state.learning}` : "Click a knob or the orb, then move a MIDI control"}</div>}
    </section>
  );
}

export function App() {
  const fit = useStageFit();
  return (
    <EngineProvider>
      <StageScale.Provider value={fit.scale}>
        <ToastProvider>
          <MidiProvider>
            <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
              <defs>
                <linearGradient id="gradV" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="var(--violet-500)" /><stop offset="1" stopColor="var(--violet-200)" /></linearGradient>
                <linearGradient id="gradA" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="var(--amber-500)" /><stop offset="1" stopColor="var(--amber-200)" /></linearGradient>
                <linearGradient id="gradVA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--violet-400)" /><stop offset="1" stopColor="var(--amber-400)" /></linearGradient>
                <radialGradient id="bodyGrad" cx="40%" cy="30%" r="80%"><stop offset="0" stopColor="#3d3a4c" /><stop offset="1" stopColor="var(--ink-800)" /></radialGradient>
              </defs>
            </svg>
            <LearnClass>
              <div id="app" style={{ transform: `scale(${fit.scale})`, left: fit.left, top: fit.top }}>
                <div className="bg-grid" />
                <TopBar />
                <SourcePanel />
                <Stage />
                <VoicesPanel />
                <GesturePanel />
                <PerformancePanel />
                <Shortcuts />
                <RecorderWarmup />
              </div>
            </LearnClass>
          </MidiProvider>
        </ToastProvider>
      </StageScale.Provider>
    </EngineProvider>
  );
}

function LearnClass({ children }: { children: React.ReactNode }) {
  const { learnMode } = useMidi();
  return <div className={learnMode ? "learn-mode" : undefined}>{children}</div>;
}
