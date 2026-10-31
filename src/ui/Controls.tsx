import type { ReactNode } from "react";

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
