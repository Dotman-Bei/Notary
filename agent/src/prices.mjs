// Prices from CoinGecko's public API (no key). Spot for forming claims, the 5-minute history for
// resolving them: the outcome uses the price point nearest the close, within 10 minutes of it.

const API = 'https://api.coingecko.com/api/v3'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(path, tries = 4) {
  for (let i = 1; ; i++) {
    const res = await fetch(`${API}${path}`, { headers: { accept: 'application/json', 'user-agent': 'notary-agent' } }).catch((e) => ({ ok: false, status: 0, e }))
    if (res.ok) return res.json()
    // 429 is the public rate limit; back off and retry.
    if (i >= tries || (res.status && res.status !== 429 && res.status < 500)) {
      throw new Error(`CoinGecko ${path} failed: ${res.status || res.e?.message}`)
    }
    await sleep(15_000 * i)
  }
}

/** { [coinId]: { usd, change24h } } */
export async function spot(coinIds) {
  const j = await get(`/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd&include_24hr_change=true`)
  const out = {}
  for (const id of coinIds) {
    if (typeof j[id]?.usd !== 'number') throw new Error(`CoinGecko returned no USD price for ${id}`)
    out[id] = { usd: j[id].usd, change24h: j[id].usd_24h_change ?? 0 }
  }
  return out
}

/** The USD price nearest `atMs`, or null when CoinGecko has no point within 10 minutes of it yet. */
export async function priceAt(coinId, atMs) {
  const from = Math.floor((atMs - 30 * 60_000) / 1000)
  const to = Math.floor((atMs + 30 * 60_000) / 1000)
  const j = await get(`/coins/${coinId}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`)
  const points = j.prices ?? []
  // Wait until the history runs past the close, so a later, nearer point cannot still arrive.
  if (!points.some(([t]) => t >= atMs)) return null
  let best = null
  for (const [t, p] of points) {
    const d = Math.abs(t - atMs)
    if (d <= 10 * 60_000 && (!best || d < best.d)) best = { d, t, usd: p }
  }
  return best && { at: best.t, usd: best.usd }
}
