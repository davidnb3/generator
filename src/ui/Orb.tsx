import { useEffect, useRef } from "react";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";
import { lerp } from "../audio/modulation";
import { progress } from "./anim";
import { useMidi } from "./context";
import { useFrame } from "./frameBus";
import { useSoundActive } from "./useSoundActive";
import { getTheme } from "./theme";
import { useCanvas } from "./useCanvas";

const TAU = Math.PI * 2;
const CX = 280, CY = 280, RI = 196, RW = 220, RR = 240;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

interface Grain { x: number; y: number; vx: number; vy: number; s: number; col: string; curl: number }

/** Keyboard steps in orb units (the orb spans -1..1). */
export const ORB_STEP = { normal: 0.02, coarse: 0.1, fine: 0.005 };

export function Orb() {
  const { instrument } = engine;
  const { manager, learnMode, state } = useMidi();
  const canvas = useCanvas(560, 560);
  const flash = useRef<HTMLDivElement>(null), readout = useRef<HTMLDivElement>(null);
  const grains = useRef<Grain[]>([]), ripples = useRef<{ t0: number; big: boolean }[]>([]), shocks = useRef<{ t0: number }[]>([]);
  const pulse = useRef(new Float32Array(240)), spawn = useRef(0), seenImpacts = useRef(0), lastAria = useRef(0);
  const peaks = useRef<number[]>([]);
  const sample = useValue(instrument.params.sample);
  useEffect(() => { peaks.current = sample.peaks; }, [sample]);
  const armed = state.learning === "orbX" || state.learning === "orbY";
  // With no sound the orb is still: no grains, no sweeping marker, no turning ring. It wakes when something can be heard.
  const active = useSoundActive(), activeRef = useRef(active), spin = useRef(0), shimmer = useRef(0);
  activeRef.current = active;

  const toNorm = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [(((e.clientX - r.left) / r.width) * 560 - CX) / RI, (((e.clientY - r.top) / r.height) * 560 - CY) / RI];
  };

  useFrame((now, dt) => {
    instrument.tick(now, dt);
    const c = canvas.current?.getContext("2d");
    if (!c) return;
    const T = getTheme(), p = instrument.params, live = instrument.live, t = now / 1000;
    const v = { density: instrument.effective("density"), size: instrument.effective("size"), spray: instrument.effective("spray") };
    const rise = live.rise, on = activeRef.current;
    spin.current += on ? (dt / 1000) * 0.18 : 0;
    shimmer.current += on ? dt / 1000 : 0;
    const ts = shimmer.current;
    const px = CX + p.orbX.value * RI, py = CY + p.orbY.value * RI;

    if (live.impacts !== seenImpacts.current) {
      seenImpacts.current = live.impacts;
      shocks.current.push({ t0: now });
      flash.current?.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 900, easing: "cubic-bezier(.22,1,.36,1)" });
      for (let i = 0; i < 18; i++) pulse.current[(Math.random() * 240) | 0] = 1;
    }

    c.clearRect(0, 0, 560, 560);
    c.save(); c.beginPath(); c.arc(CX, CY, RI + 10, 0, TAU); c.clip();
    const fg = c.createRadialGradient(px, py, 0, px, py, 190);
    fg.addColorStop(0, `rgba(${T.rgb.violet400},.34)`); fg.addColorStop(0.5, `rgba(${T.rgb.violet400},.10)`); fg.addColorStop(1, `rgba(${T.rgb.violet400},0)`);
    c.fillStyle = fg; c.fillRect(0, 0, 560, 560);
    const fg2 = c.createRadialGradient(CX, CY, 0, CX, CY, RI);
    fg2.addColorStop(0, "rgba(12,10,20,0)"); fg2.addColorStop(1, `rgba(${T.rgb.amber400},.05)`);
    c.fillStyle = fg2; c.fillRect(0, 0, 560, 560);
    c.restore();

    c.lineWidth = 1; c.strokeStyle = "rgba(255,255,255,.075)"; c.setLineDash([2, 7]);
    [0.25, 0.5, 0.75, 1].forEach((f) => { c.beginPath(); c.arc(CX, CY, RI * f, 0, TAU); c.stroke(); });
    c.setLineDash([]); c.strokeStyle = "rgba(255,255,255,.05)";
    c.beginPath(); c.moveTo(CX - RI, CY); c.lineTo(CX + RI, CY); c.moveTo(CX, CY - RI); c.lineTo(CX, CY + RI); c.stroke();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU, major = i % 6 === 0, r1 = major ? 211 : 207;
      c.strokeStyle = major ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.1)";
      c.beginPath(); c.moveTo(CX + Math.cos(a) * 203, CY + Math.sin(a) * 203); c.lineTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1); c.stroke();
    }

    const headA = live.head * TAU - Math.PI / 2, reverse = p.reverse.value, pk = peaks.current, N = 240;
    c.lineCap = "round"; c.lineWidth = 2.2;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU - Math.PI / 2, peak = pk[Math.floor((i / N) * pk.length)] ?? 0;
      pulse.current[i] *= 0.93;
      const amp = (0.14 + 0.86 * peak) * (0.92 + 0.08 * Math.sin(ts * 2.2 + i * 0.35)) * (1 + v.density * 0.12) + pulse.current[i] * 0.55;
      const half = 2 + amp * 15;
      let behind = (headA - a) % TAU; if (behind < 0) behind += TAU; if (reverse) behind = TAU - behind;
      c.strokeStyle = on && behind < 1.1
        ? `rgba(255,${Math.round(190 - behind * 40)},${Math.round(110 + behind * 30)},${0.95 - behind * 0.45})`
        : `rgba(165,140,255,${0.34 + pulse.current[i] * 0.6})`;
      const cs = Math.cos(a), sn = Math.sin(a);
      c.beginPath(); c.moveTo(CX + cs * (RW - half), CY + sn * (RW - half)); c.lineTo(CX + cs * (RW + half), CY + sn * (RW + half)); c.stroke();
    }
    if (on) {
      c.save(); c.shadowColor = T.hex.amber400; c.shadowBlur = 14; c.strokeStyle = T.hex.amber200; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(CX + Math.cos(headA) * 200, CY + Math.sin(headA) * 200); c.lineTo(CX + Math.cos(headA) * 238, CY + Math.sin(headA) * 238); c.stroke(); c.restore();
    }

    c.lineWidth = 2 + rise * 2.5;
    let rg: string | CanvasGradient = T.hex.violet400;
    if (c.createConicGradient) {
      const g = c.createConicGradient(spin.current, CX, CY);
      g.addColorStop(0, T.hex.violet400); g.addColorStop(0.5, T.hex.amber400); g.addColorStop(1, T.hex.violet400);
      rg = g;
    }
    c.strokeStyle = rg; c.beginPath(); c.arc(CX, CY, RR, 0, TAU); c.stroke();
    if (rise > 0.02) {
      c.strokeStyle = `rgba(${T.rgb.amber200},${rise * 0.35})`; c.lineWidth = 1;
      c.beginPath(); c.arc(CX, CY, RR + 6 + Math.sin(t * 9) * 2 * rise, 0, TAU); c.stroke();
    }

    shocks.current = shocks.current.filter((s) => now - s.t0 < 1300);
    shocks.current.forEach((s) => {
      const k = progress(now, s.t0, 1300);
      c.strokeStyle = `rgba(255,214,150,${(1 - k) * 0.85})`; c.lineWidth = 1 + 5 * (1 - k);
      c.beginPath(); c.arc(CX, CY, easeOut(k) * RR * 1.06, 0, TAU); c.stroke();
    });
    ripples.current = ripples.current.filter((r) => now - r.t0 < 1400);
    ripples.current.forEach((r) => {
      const k = progress(now, r.t0, 1400);
      c.strokeStyle = `rgba(${T.rgb.violet200},${(1 - k) * 0.6})`; c.lineWidth = 1.2;
      c.beginPath(); c.arc(px, py, easeOut(k) * (r.big ? 90 : 56), 0, TAU); c.stroke();
    });

    const rate = on ? (0.9 + v.density * 4.2 + rise * 3.2) * (p.freeze.value ? 0.25 : 1) : 0;
    if (!on) { grains.current = []; spawn.current = 0; }
    spawn.current = Math.min(4, spawn.current + (dt / 16.7) * rate);
    while (spawn.current >= 1 && grains.current.length < 900) {
      spawn.current -= 1;
      const a = Math.random() * TAU, sp = (50 + Math.random() * 170) * (0.7 + (1 - v.size) * 0.7) * (1 + rise * 0.9), h = Math.random();
      grains.current.push({
        x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: 0.9 + v.size * 2.3 * Math.random(),
        col: h < 0.45 ? T.rgb.cream : h < 0.8 ? T.rgb.violet200 : T.rgb.amber400, curl: (Math.random() - 0.5) * 0.9 * (0.4 + v.spray),
      });
    }
    const alive: Grain[] = [], sec = dt / 1000;
    for (const g of grains.current) {
      const cs = Math.cos(g.curl * sec), sn = Math.sin(g.curl * sec), nvx = g.vx * cs - g.vy * sn, nvy = g.vx * sn + g.vy * cs;
      g.vx = nvx; g.vy = nvy;
      const ox = g.x, oy = g.y; g.x += g.vx * sec; g.y += g.vy * sec;
      const dx = g.x - CX, dy = g.y - CY, dist = Math.hypot(dx, dy);
      if (dist >= RW - 18) {
        let ang = Math.atan2(dy, dx) + Math.PI / 2; if (ang < 0) ang += TAU;
        const idx = Math.floor((ang / TAU) * 240) % 240;
        for (let d = -2; d <= 2; d++) { const k = (idx + d + 240) % 240; pulse.current[k] = Math.max(pulse.current[k], 1 - Math.abs(d) * 0.3); }
        continue;
      }
      alive.push(g);
      const fade = Math.min(1, Math.max(0, 1 - dist / RW)) * 0.8 + 0.2;
      c.strokeStyle = `rgba(${g.col},${0.18 * fade + 0.1})`; c.lineWidth = 1;
      c.beginPath(); c.moveTo(ox - g.vx * 0.16, oy - g.vy * 0.16); c.lineTo(g.x, g.y); c.stroke();
      c.fillStyle = `rgba(${g.col},${0.55 + 0.4 * fade})`;
      c.beginPath(); c.arc(g.x, g.y, g.s, 0, TAU); c.fill();
    }
    grains.current = alive;

    const held = p.orbHeld.value, pls = 1 + Math.sin(ts * 3) * 0.08;
    c.save(); c.shadowColor = T.hex.violet200; c.shadowBlur = 22; c.strokeStyle = `rgba(${T.rgb.violet200},.9)`; c.lineWidth = 1.4;
    c.beginPath(); c.arc(px, py, (held ? 19 : 15) * pls, 0, TAU); c.stroke(); c.restore();
    c.strokeStyle = T.hex.amber200; c.lineWidth = 1.6; c.beginPath(); c.arc(px, py, 8, 0, TAU); c.stroke();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(px, py, 3.2, 0, TAU); c.fill();

    if (now - lastAria.current > 250 && readout.current) {
      lastAria.current = now;
      readout.current.textContent = `Texture ${Math.round(((p.orbX.value + 1) / 2) * 100)} percent, energy ${Math.round(((1 - p.orbY.value) / 2) * 100)} percent`;
    }
  });

  return (
    <>
      <canvas
        id="orb" ref={canvas} className={armed ? "armed" : undefined} style={{ width: 560, height: 560 }}
        tabIndex={0} role="application" aria-roledescription="2D modulation pad" aria-label="Orb. Arrow keys move the puck. Shift moves farther, Alt moves finer, Home centres."
        aria-describedby="orb-readout"
        onPointerDown={(e) => {
          if (learnMode) { manager.learn("orbX", "orbY"); return; }
          e.currentTarget.setPointerCapture(e.pointerId);
          instrument.holdOrb(true);
          const [x, y] = toNorm(e);
          instrument.setOrb(x, y);
          ripples.current.push({ t0: performance.now(), big: true });
        }}
        onPointerMove={(e) => {
          if (!instrument.params.orbHeld.value) return;
          const [x, y] = toNorm(e);
          instrument.setOrb(lerp(instrument.params.orbX.value, x, 0.55), lerp(instrument.params.orbY.value, y, 0.55));
        }}
        onPointerUp={() => instrument.holdOrb(false)}
        onPointerCancel={() => instrument.holdOrb(false)}
        onKeyDown={(e) => {
          if (e.ctrlKey || e.metaKey) return;
          const step = e.shiftKey ? ORB_STEP.coarse : e.altKey ? ORB_STEP.fine : ORB_STEP.normal;
          const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          if (d[e.key]) { e.preventDefault(); instrument.nudgeOrb(...d[e.key]); }
          else if (e.key === "Home") { e.preventDefault(); instrument.setOrb(0, 0); ripples.current.push({ t0: performance.now(), big: true }); }
        }}
      />
      <div className="flash" ref={flash} />
      <div id="orb-readout" className="sr-only" ref={readout} />
    </>
  );
}
