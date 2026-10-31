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

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  const timer = useRef<number>(0);
  const toast = useCallback((m: string) => {
    setMsg(m); setShow(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div id="toast" role="status" className={show ? "show" : ""}>{msg}</div>
    </ToastCtx.Provider>
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
