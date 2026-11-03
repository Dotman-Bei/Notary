import { priceAt, spot } from './prices.mjs'

// Daybreak, the built-in demo agent (PRD §5.2). Each day from 06:00 UTC it seals one claim per market
// about that night's 00:00 UTC price, and after the close it reveals each claim with the observed outcome.
//
// The forecast is deliberately plain: follow the last 24 hours. If a market rose, claim it stays above
// a level 0.4% under spot; if it fell, claim it stays below a level 0.4% over spot. The point of
// Daybreak is a public, tamper-evident record, not a good model.

export const MARKETS = [
  { pair: 'BTC/USD', coin: 'bitcoin', dp: 2 },
  { pair: 'ETH/USD', coin: 'ethereum', dp: 2 },
  { pair: 'SOL/USD', coin: 'solana', dp: 2 },
  { pair: 'BNB/USD', coin: 'binancecoin', dp: 2 },
  { pair: 'XRP/USD', coin: 'ripple', dp: 4 },
]

export const NAME = 'Daybreak'
export const METADATA_URI = 'https://github.com/Dotman-Bei/Notary/tree/main/agent'
const DAY = 86_400_000
const HOUR = 3_600_000
const SEAL_FROM = 6 * HOUR // 06:00 UTC
const SEAL_UNTIL = 23 * HOUR // no new claims in the last hour before the close
const BUFFER = 0.004

const isoDay = (t) => new Date(t).toISOString().slice(0, 10)
const money = (v, dp) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp, useGrouping: true })

export function claimFor(m, price, closeAt) {
  const above = price.change24h >= 0
  const raw = price.usd * (above ? 1 - BUFFER : 1 + BUFFER)
  const level = Number(raw.toFixed(m.dp))
  const text = `${m.pair} closes ${above ? 'above' : 'below'} ${money(level, m.dp)} on ${isoDay(closeAt)} at 00:00 UTC`
  return { text, side: above ? 'above' : 'below', level }
}

export const outcomeOf = (claim, closeUsd) => (claim.side === 'above' ? closeUsd > claim.level : closeUsd < claim.level)

/** One pass: seal today's claims if they are due and missing, then reveal every claim whose close has passed. */
export async function tick({ api, store, now, log = console.log }) {
  await api.reconcile(store)
  const mine = store.data.receipts.filter((r) => r.daybreak && r.status !== 'dropped')

  // Seal
  const dayStart = Math.floor(now / DAY) * DAY
  const closeAt = dayStart + DAY
  const sinceStart = now - dayStart
  const today = mine.filter((r) => r.daybreak.closeAt === closeAt)
  const missing = MARKETS.filter((m) => !today.some((r) => r.daybreak.pair === m.pair))
  if (missing.length && sinceStart >= SEAL_FROM && sinceStart < SEAL_UNTIL) {
    log(`Sealing ${missing.length} claim(s) for the ${isoDay(closeAt)} close`)
    const prices = await spot(missing.map((m) => m.coin))
    for (const m of missing) {
      const claim = claimFor(m, prices[m.coin], closeAt)
      log(`- ${claim.text}`)
      const e = await api.seal(store, { claimText: claim.text, category: m.pair, extra: { daybreak: { pair: m.pair, coin: m.coin, side: claim.side, level: claim.level, closeAt } } })
      log(`  sealed as #${e.id}`)
    }
  }

  // Reveal
  const due = mine.filter((r) => r.status === 'sealed' && r.daybreak.closeAt <= now)
  for (const e of due) {
    const close = await priceAt(e.daybreak.coin, e.daybreak.closeAt)
    if (!close) { log(`#${e.id}: no ${e.daybreak.pair} price for the close yet, will retry`); continue }
    const outcome = outcomeOf(e.daybreak, close.usd)
    e.daybreak.closeUsd = close.usd
    e.daybreak.closePointAt = close.at
    log(`Revealing #${e.id}: ${e.claimText}`)
    log(`  ${e.daybreak.pair} at ${new Date(close.at).toISOString()} was ${close.usd} → ${outcome ? 'TRUE' : 'FALSE'}`)
    await api.reveal(store, e, outcome)
  }

  const waiting = store.data.receipts.filter((r) => r.daybreak && r.status === 'sealed').length
  const nextSeal = missing.length && sinceStart < SEAL_FROM ? dayStart + SEAL_FROM : dayStart + DAY + SEAL_FROM
  return { waiting, nextSeal }
}
