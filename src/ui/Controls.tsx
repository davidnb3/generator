import { useContext, useRef, type ReactNode } from "react";
import { StageScale } from "./context";
import { arc } from "./Knob";

export function Segmented<T extends string | number>({ options, value, onChange, label, small, suffix }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; small?: boolean; suffix?: string;
}) {
  return (
    <div className={`seg${small ? " small" : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
      {suffix && <small>{suffix}</small>}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" aria-pressed={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Panel({ id, delay, style, title, em, children }: { id: string; delay: number; style: React.CSSProperties; title: ReactNode; em?: string; children: ReactNode }) {
  return (
    <section className="panel enter" id={id} style={{ ["--d" as string]: delay, ...style }}>
      <h4>{title}{em && <em>{em}</em>}</h4>
      {children}
    </section>
  );
}

const ICONS: Record<string, ReactNode> = {
  freeze: <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />,
  reverse: <path d="M14 6l-6 6 6 6M20 6l-6 6 6 6" />,
  scatter: <><circle cx="6" cy="8" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="10" cy="13" r="1.4" /><circle cx="18" cy="15" r="1.4" /><circle cx="7" cy="18" r="1.4" /></>,
  octave: <text x="12" y="15" textAnchor="middle">8va</text>,
  stutter: <path d="M5 17V7M9 17V10M13 17V12M17 17V14M21 17v-1" />,
  evolve: <path d="M2.5 12c3-9 6-9 9.5 0s6.5 9 9.5 0" />,
  resample: <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />,
  reroll: <><rect x="4" y="4" width="16" height="16" rx="3.5" /><circle cx="9" cy="9" r=".9" /><circle cx="15" cy="15" r=".9" /><circle cx="12" cy="12" r=".9" /></>,
};

export function MacroButton({ kind, label, on, onClick }: { kind: keyof typeof ICONS; label: string; on: boolean; onClick: () => void }) {
  return (
    <button className={`mac${on ? " on" : ""}`} aria-pressed={on} onClick={onClick}>
      <div className="ring"><svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[kind]}</svg></div>
      <span className="n">{label}</span>
    </button>
  );
}

/** A macro button with an amount. Tap turns it on (at 50%); drag up or down on it to change the amount; tap again to turn it off. */
export function MacroKnob({ kind, label, on, amount, onToggle, onAmount }: {
  kind: keyof typeof ICONS; label: string; on: boolean; amount: number; onToggle: () => void; onAmount: (v: number) => void;
}) {
  const scale = useContext(StageScale);
  const drag = useRef<{ y: number; v: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  return (
    <button
      className={`mac amount${on ? " on" : ""}`} aria-pressed={on} aria-label={on ? `${label}, ${Math.round(amount * 100)} percent` : label}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, v: amount, moved: false }; dragged.current = false; }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !on) return;
        if (Math.abs(e.clientY - d.y) > 3) { d.moved = true; dragged.current = true; }
        if (d.moved) onAmount(clamp01(d.v + (d.y - e.clientY) / scale / 160));
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onClick={() => { if (dragged.current) { dragged.current = false; return; } onToggle(); }}
      onKeyDown={(e) => {
        if (on && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); onAmount(clamp01(amount + (e.key === "ArrowUp" ? 0.02 : -0.02))); }
      }}
    >
      <div className="ring">
        {on && (
          <svg className="amt" viewBox="0 0 62 62" aria-hidden="true">
            <path className="trk" d={arc(31, 31, 29, 135, 405)} />
            <path className="val" d={arc(31, 31, 29, 135, 135 + 270 * amount)} />
          </svg>
        )}
        <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[kind]}</svg>
      </div>
      <span className="n">{label}</span>
      <span className="v">{on ? `${Math.round(amount * 100)}%` : ""}</span>
    </button>
  );
}
