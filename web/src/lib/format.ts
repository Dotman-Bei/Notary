const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

export const pct = (v: number | null, dp = 1) => (v === null ? '—' : `${(v * 100).toFixed(dp)}%`)
export const count = (n: number) => n.toLocaleString('en-US')

export function utcTime(t: number, seconds = false) {
  const d = new Date(t)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${seconds ? `:${pad(d.getUTCSeconds())}` : ''}`
}

export function utcDate(t: number) {
  const d = new Date(t)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10)

export function ago(t: number, now: number) {
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ${m % 60 ? `${m % 60} min ` : ''}ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'Yesterday' : `${d} days ago`
}
