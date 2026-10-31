import { useContext, useRef, type CSSProperties } from "react";
import type { Param } from "@audiorective/core";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";
import type { ModulatedId, NumericId, PlainId } from "../audio/params";
import { StageScale, useMidi } from "./context";
import { useFrame } from "./frameBus";

const GA = 135, SW = 270;
const pol = (cx: number, cy: number, r: number, a: number): [number, number] => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  if (Math.abs(a1 - a0) < 0.05) a1 = a0 + 0.05;
  const [x0, y0] = pol(cx, cy, r, a0), [x1, y1] = pol(cx, cy, r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

interface KnobProps {
  param: Param<number>;
  /** Knobs the orb or a gesture can move show the heard value on top of the set value. */
  heardId?: ModulatedId | PlainId;
  /** Instrument control id used for MIDI learn. */
  target: NumericId;
  label: string;
  size?: number;
  grad?: "V" | "A";
  big?: boolean;
  style?: CSSProperties;
  onChange?: () => void;
}

export function Knob({ param, heardId, target, label, size = 76, grad = "V", big = false, style, onChange }: KnobProps) {
  const base = useValue(param);
  const scale = useContext(StageScale);
  const { manager, learnMode, state } = useMidi();
  const { instrument } = engine;
  const half = size / 2, R = half - 9, rb = R * 0.7;
  const modRef = useRef<SVGPathElement>(null), dotRef = useRef<SVGCircleElement>(null), kvRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; v: number } | null>(null);
  const armed = state.learning === target;

  useFrame(() => {
    const eff = heardId ? instrument.effective(heardId) : param.value;
    const ab = GA + SW * param.value, ae = GA + SW * eff;
    const moved = Math.abs(eff - param.value) > 0.004;
    modRef.current?.setAttribute("d", moved ? arc(half, half, R + 5.5, Math.min(ab, ae), Math.max(ab, ae)) : "");
    const [mx, my] = pol(half, half, R + 5.5, ae);
    dotRef.current?.setAttribute("cx", String(mx));
    dotRef.current?.setAttribute("cy", String(my));
    if (kvRef.current) kvRef.current.textContent = String(Math.round(eff * 100));
  });

  const set = (v: number) => { param.value = Math.min(1, Math.max(0, v)); onChange?.(); };
  const ab = GA + SW * base;
  const [ix0, iy0] = pol(half, half, rb * 0.25, ab), [ix1, iy1] = pol(half, half, rb * 0.82, ab);
  const showDot = heardId !== undefined;

  return (
    <div className={`knob ${grad === "A" ? "a" : "v"}${big ? " big" : ""}${armed ? " armed" : ""}`} style={{ width: size, ...style }}>
      <svg
        width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="slider" tabIndex={0}
        aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(base * 100)}
        onPointerDown={(e) => {
          if (learnMode) { manager.learn(target); return; }
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, v: param.value };
          e.preventDefault();
        }}
        onPointerMove={(e) => { if (drag.current) set(drag.current.v + (drag.current.y - e.clientY) / scale / (e.shiftKey ? 500 : 180)); }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => { if (!learnMode) set(engine.instrument.defaultOf(target)); }}
        onKeyDown={(e) => {
          const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? 0.02 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -0.02 : 0;
          if (!d) return;
          e.preventDefault();
          set(param.value + d * (e.shiftKey ? 5 : 1));
        }}
      >
        <path className="trk" d={arc(half, half, R, GA, GA + SW)} />
        <path className="val" d={arc(half, half, R, GA, ab)} stroke={`url(#grad${grad})`} />
        <path className="mod" ref={modRef} />
        <circle className="mdot" r={2.6} ref={dotRef} style={{ opacity: showDot ? 1 : 0 }} />
        <circle cx={half} cy={half} r={rb} fill="url(#bodyGrad)" stroke="rgba(255,255,255,.14)" />
        <circle cx={half} cy={half} r={rb - 3} fill="none" stroke="rgba(255,255,255,.05)" />
        <line className="ind" x1={ix0} y1={iy0} x2={ix1} y2={iy1} />
      </svg>
      <div className="kl">{label}</div>
      <div className="kv" ref={kvRef}>{Math.round(base * 100)}</div>
    </div>
  );
}
