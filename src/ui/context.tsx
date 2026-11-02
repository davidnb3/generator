import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { engine } from "../audio/engine";
import { MidiManager } from "../midi/midi";

export const StageScale = createContext(1);

/** Fits the fixed 1440x900 design stage into the window. */
export function useStageFit() {
  const [fit, setFit] = useState({ scale: 1, left: 0, top: 0 });
  useEffect(() => {
    const on = () => {
      const s = Math.min(innerWidth / 1440, innerHeight / 900);
      setFit({ scale: s, left: (innerWidth - 1440 * s) / 2, top: (innerHeight - 900 * s) / 2 });
    };
    on();
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return fit;
}

export type ToastKind = "info" | "error";
interface ToastState { msg: string; kind: ToastKind; show: boolean }

const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
const ToastStateCtx = createContext<ToastState>({ msg: "", kind: "info", show: false });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>({ msg: "", kind: "info", show: false });
  const timer = useRef<number>(0);
  const toast = useCallback((msg: string, kind: ToastKind = "info") => {
    setState({ msg, kind, show: true });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState((s) => ({ ...s, show: false })), kind === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      <ToastStateCtx.Provider value={state}>{children}</ToastStateCtx.Provider>
    </ToastCtx.Provider>
  );
}

/** Rendered inside the scaled stage, so it grows with the screen like everything else. Errors are red and stay longer. */
export function ToastView() {
  const { msg, kind, show } = useContext(ToastStateCtx);
  return (
    <div id="toast" role={kind === "error" ? "alert" : "status"} className={`${show ? "show" : ""}${kind === "error" ? " error" : ""}`}>
      {kind === "error" && <i aria-hidden="true">!</i>}
      <span>{msg}</span>
    </div>
  );
}

interface MidiCtx { manager: MidiManager; learnMode: boolean; setLearnMode: (on: boolean) => void }
const MidiContext = createContext<MidiCtx | null>(null);

export function MidiProvider({ children }: { children: ReactNode }) {
  const manager = useMemo(() => new MidiManager(engine.instrument), []);
  const [learnMode, setLearnMode] = useState(false);
  const value = useMemo(() => ({ manager, learnMode, setLearnMode }), [manager, learnMode]);
  return <MidiContext.Provider value={value}>{children}</MidiContext.Provider>;
}

export function useMidi() {
  const ctx = useContext(MidiContext)!;
  const state = useSyncExternalStore(ctx.manager.subscribe, () => ctx.manager.snapshot);
  return { ...ctx, state };
}
