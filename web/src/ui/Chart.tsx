import { useEffect, useRef } from 'react'
import '../vendor/charts.js'

type Kind = 'line' | 'bars'
type Fmt = 'int' | 'pct0' | 'pct1'

const formatter = (f: Fmt | undefined) => {
  const C = window.Charts
  if (f === 'pct0') return (C.fmt.pct as (d: number) => (v: number) => string)(0)
  if (f === 'pct1') return (C.fmt.pct as (d: number) => (v: number) => string)(1)
  return C.fmt.int
}

interface Props {
  kind: Kind
  opts: Record<string, unknown> & { format?: Fmt; tickFormat?: Fmt }
}

// Draws one of the skill's SVG charts into a div and redraws when its data changes.
// Options stay plain data (format names instead of functions) so the effect can compare them.
export function Chart({ kind, opts }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const key = JSON.stringify(opts)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = JSON.parse(key)
    el.replaceChildren()
    window.Charts[kind](el, { ...o, format: formatter(o.format), tickFormat: o.tickFormat ? formatter(o.tickFormat) : null })
  }, [kind, key])
  return <div className="chart" ref={ref} />
}
