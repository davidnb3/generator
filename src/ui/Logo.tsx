/** The Grainwash mark: grains on the left dissolving off a smooth head, with an eye. Source of truth: design/logo/grainwash-mark.svg. */
const GRAINS: [number, number, number][] = [
  [86, 92, 3], [72, 83, 3], [66, 66, 2.6], [70, 48, 2.6], [82, 37, 2.2], [54, 58, 2], [46, 72, 1.7], [38, 52, 1.5], [30, 66, 1.2],
];

export function Logo({ height = 26, decorative = false }: { height?: number; decorative?: boolean }) {
  return (
    <svg className="logo" height={height} width={(height * 108) / 72} viewBox="24 28 108 72" role={decorative ? undefined : "img"} aria-label={decorative ? undefined : "Grainwash"} aria-hidden={decorative || undefined}>
      <path d="M96 34A30 30 0 0 1 96 94" fill="none" stroke="var(--amber-400)" strokeWidth="4" strokeLinecap="round" />
      <g fill="var(--violet-200)">{GRAINS.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}</g>
      <circle cx="109" cy="58" r="4" fill="var(--cream)" />
    </svg>
  );
}
