import { useMemo } from "react";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";
import { GESTURE_CURVES, curveValue, gestureNoise } from "../audio/gesture";
import { clamp } from "../audio/modulation";
import { useFrame } from "./frameBus";
import { getTheme } from "./theme";
import { useCanvas } from "./useCanvas";

export function MiniWave() {
  const { instrument } = engine;
  const ref = useCanvas(228, 56);
  const sample = useValue(instrument.params.sample);
  useFrame(() => {
    const c = ref.current?.getContext("2d");
    if (!c) return;
    const T = getTheme(), w = 228, h = 56, n = 76, bw = w / n, head = instrument.live.head, reverse = instrument.params.reverse.value;
    c.clearRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const pk = sample.peaks[Math.floor((i / n) * sample.peaks.length)] ?? 0, hh = 2 + pk * (h - 6);
      const behind = (head - i / n + 1) % 1;
      c.fillStyle = !reverse && behind < 0.18 ? T.hex.amber200 : `rgba(165,140,255,.55)`;
      c.fillRect(i * bw + 1, h / 2 - hh / 2, Math.max(1.5, bw - 2), hh);
    }
    c.fillStyle = T.hex.amber200; c.fillRect(head * w - 1, 0, 2, h);
  });
  return <canvas id="mini" ref={ref} style={{ width: "100%", height: 56 }} aria-label="Sample overview" role="img" />;
}

const COLORS = ["violet200", "violet400", "amber400", "rose400"] as const;

export function GestureCurves() {
  const { instrument } = engine;
  const p = instrument.params;
  const ref = useCanvas(440, 180);
  const seed = useValue(p.seed);
  const type = useValue(p.gestureType);
  const bars = useValue(p.gestureBars);
  const rand = useValue(p.random);
  const shape = useValue(p.shape);
  const noise = useMemo(() => gestureNoise(seed), [seed]);

  useFrame(() => {
    const c = ref.current?.getContext("2d");
    if (!c) return;
    const T = getTheme(), w = 440, h = 180, pad = 14, gw = w - pad * 2, gh = h - 40;
    c.clearRect(0, 0, w, h);
    c.lineWidth = 1;
    for (let b = 0; b <= bars; b++) {
      const x = pad + (b / bars) * gw;
      c.strokeStyle = b % 4 === 0 ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.05)";
      c.beginPath(); c.moveTo(x, 8); c.lineTo(x, 8 + gh); c.stroke();
    }
    c.fillStyle = "rgba(255,255,255,.28)"; c.font = "10px JetBrains Mono, monospace";
    c.fillText("1", pad, h - 8); c.fillText(String(bars + 1), pad + gw - 8, h - 8);
    GESTURE_CURVES.forEach((cv, ci) => {
      c.beginPath();
      const pts: [number, number][] = [];
      for (let j = 0; j < 64; j++) {
        const u = j / 63, v = clamp(curveValue(cv, u, type, shape) + noise[ci][j] * rand * 0.28);
        pts.push([pad + u * gw, 8 + gh - v * gh]);
      }
      pts.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.strokeStyle = T.hex[COLORS[ci]]; c.lineWidth = ci === 0 ? 2.2 : 1.6; c.globalAlpha = ci === 0 ? 1 : 0.8; c.stroke(); c.globalAlpha = 1;
      if (ci === 0) {
        c.lineTo(pad + gw, 8 + gh); c.lineTo(pad, 8 + gh); c.closePath();
        const g = c.createLinearGradient(0, 8, 0, 8 + gh);
        g.addColorStop(0, `rgba(${T.rgb.violet200},.28)`); g.addColorStop(1, `rgba(${T.rgb.violet200},0)`);
        c.fillStyle = g; c.fill();
      }
    });
    GESTURE_CURVES.forEach((cv, i) => {
      c.fillStyle = T.hex[COLORS[i]]; c.fillRect(pad + 50 + i * 76, h - 17, 6, 6);
      c.fillStyle = "rgba(255,255,255,.5)"; c.fillText(cv.id, pad + 62 + i * 76, h - 10);
    });
    if (instrument.gestureActive) {
      const x = pad + p.gestureProgress.value * gw;
      c.strokeStyle = T.hex.amber200; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, 4); c.lineTo(x, 8 + gh + 4); c.stroke();
      c.fillStyle = T.hex.amber200; c.beginPath(); c.arc(x, 4, 3, 0, Math.PI * 2); c.fill();
    }
  });
  return <canvas id="gcv" ref={ref} style={{ width: 440, height: 180 }} role="img" aria-label="Gesture curves for density, size, filter and space" />;
}

export function Meters({ dbRef }: { dbRef: React.RefObject<HTMLSpanElement | null> }) {
  const { instrument } = engine;
  const ref = useCanvas(490, 30);
  useFrame(() => {
    const c = ref.current?.getContext("2d");
    if (!c) return;
    const T = getTheme(), w = 490, segs = 56, sw = (w - (segs - 1) * 2) / segs;
    c.clearRect(0, 0, w, 30);
    [0, 1].forEach((ch) => {
      const lit = Math.round(instrument.live.meter[ch] * segs);
      for (let i = 0; i < segs; i++) {
        const f = i / segs, col = f < 0.6 ? T.rgb.violet400 : f < 0.85 ? T.rgb.amber400 : T.rgb.rose400;
        c.fillStyle = i < lit ? `rgba(${col},.95)` : "rgba(255,255,255,.07)";
        c.fillRect(i * (sw + 2), ch * 16, sw, 11);
      }
    });
    if (dbRef.current) dbRef.current.textContent = `${instrument.live.db.toFixed(1)} dB`;
  });
  return <canvas id="meters" ref={ref} style={{ width: "100%", height: 30 }} role="img" aria-label="Output level" />;
}
