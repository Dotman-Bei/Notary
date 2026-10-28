// The one motif: a notary's crimped embossing seal. Every curve on the site is this shape.
const TEETH = 48

function crimp(teeth: number, outer: number, inner: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < teeth * 2; i++) {
    const a = (Math.PI * i) / teeth - Math.PI / 2
    const r = i % 2 ? inner : outer
    pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)])
  }
  return pts
}

const outline = crimp(TEETH, 50, 47)
export const SEAL_POINTS = outline.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
// The same outline as a CSS clip-path, for masking photographs and fields.
export const SEAL_CLIP = `polygon(${outline.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`

type Variant = 'solid' | 'ring' | 'true' | 'false'

interface Props {
  size?: number | string
  variant?: Variant
  className?: string
  title?: string
}

// Small status marks use fewer teeth so the crimp still reads at 10–16px.
const small = crimp(16, 50, 42).map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')

export function Seal({ size = 16, variant = 'solid', className, title }: Props) {
  const tiny = typeof size === 'number' && size <= 24
  const points = tiny ? small : SEAL_POINTS
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {variant === 'ring' ? (
        <polygon points={points} fill="none" stroke="currentColor" strokeWidth={tiny ? 10 : 3} strokeLinejoin="round" />
      ) : (
        <polygon points={points} fill="currentColor" />
      )}
      {variant === 'false' && <path d="M30 30 L70 70" stroke="var(--seal-cut, #fff)" strokeWidth="12" strokeLinecap="round" />}
    </svg>
  )
}
