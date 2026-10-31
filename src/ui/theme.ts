/** Canvas can't read var(); read the design tokens once, after the stylesheet has loaded. */
const NAMES = {
  violet500: "--violet-500", violet400: "--violet-400", violet200: "--violet-200",
  amber500: "--amber-500", amber400: "--amber-400", amber200: "--amber-200",
  rose400: "--rose-400", cream: "--cream", ink700: "--ink-700",
} as const;

export interface Theme { hex: Record<keyof typeof NAMES, string>; rgb: Record<keyof typeof NAMES, string> }
let cached: Theme | null = null;

function toRgb(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export function getTheme(): Theme {
  if (cached) return cached;
  const style = getComputedStyle(document.documentElement);
  const hex = {} as Theme["hex"], rgb = {} as Theme["rgb"];
  (Object.keys(NAMES) as (keyof typeof NAMES)[]).forEach((k) => {
    hex[k] = style.getPropertyValue(NAMES[k]).trim() || "#ffffff";
    rgb[k] = toRgb(hex[k]);
  });
  return (cached = { hex, rgb });
}
