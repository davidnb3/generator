import { useContext, useLayoutEffect, useRef } from "react";
import { StageScale } from "./context";

/** Canvas with a backing store sized for the screen and the stage scale; draw in logical w x h units. */
export function useCanvas(w: number, h: number) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = useContext(StageScale);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const r = Math.min(3, Math.max(1, (devicePixelRatio || 1) * scale));
    c.width = Math.round(w * r);
    c.height = Math.round(h * r);
    c.getContext("2d")?.setTransform(r, 0, 0, r, 0, 0);
  }, [w, h, scale]);
  return ref;
}
