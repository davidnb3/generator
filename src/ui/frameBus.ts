import { useEffect, useRef } from "react";

type Frame = (now: number, dt: number) => void;
const subs: { cb: Frame; prio: number }[] = [];
let raf = 0, last = 0;

let reported = 0;

/** One failing subscriber must not stop the animation loop (and with it every other view), so errors are caught per callback. */
function loop(now: number) {
  const dt = Math.min(50, now - last || 16.7);
  last = now;
  try {
    for (const s of [...subs]) {
      try { s.cb(now, dt); }
      catch (e) { if (reported++ < 5) console.error("Frame callback failed:", e); }
    }
  } finally {
    raf = subs.length ? requestAnimationFrame(loop) : 0;
  }
}

/** One shared animation loop. Lower priority runs first, so the instrument ticks before views draw. */
export function subscribeFrame(cb: Frame, prio = 1) {
  const entry = { cb, prio };
  subs.push(entry);
  subs.sort((a, b) => a.prio - b.prio);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  return () => { const i = subs.indexOf(entry); if (i >= 0) subs.splice(i, 1); };
}

export function useFrame(cb: Frame, prio = 1) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => subscribeFrame((n, d) => ref.current(n, d), prio), [prio]);
}
