// Sample register: what the app shows until VITE_NOTARY_ADDRESS and VITE_BOT_RPC_URL are set.
// Every hash is real keccak256 over the PRD's chain (agentId ‖ claimText ‖ nonce ‖ prevHash), so the
// chain verifies; agents, claims, prices and outcomes are invented sample content (listed in the report).
import { encodePacked, keccak256, type Address, type Hex } from 'viem'
import { receiptHash, ZERO_HASH } from '../lib/receipt'
import type { Agent, Receipt, Register } from './types'

export const SAMPLE_NOW = Date.UTC(2026, 9, 28, 9, 14, 0)
const DAY = 86_400_000
const HOUR = 3_600_000

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hashOf = (...parts: string[]) => keccak256(encodePacked(['string'], [parts.join('|')]))
const addressOf = (name: string) => `0x${hashOf('agent', name).slice(26)}` as Address

// Picks exactly `count` indices of `n` to be false, deterministically.
function falseSet(n: number, count: number, rand: () => number) {
  const idx = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return new Set(idx.slice(0, count))
}

interface Draft {
  sealedAt: number
  revealedAt?: number
  category: string
  claimText: string
  outcome: Receipt['outcome']
}

function chain(agent: Agent, drafts: Draft[]): Receipt[] {
  let prev: Hex = ZERO_HASH
  return drafts.map((d, i) => {
    const id = i + 1
    const nonce = hashOf('nonce', agent.name, String(id))
    const hash = receiptHash(agent.id, d.claimText, nonce, prev)
    const r: Receipt = {
      agentId: agent.id, id, category: d.category, claimText: d.claimText, nonce, prevHash: prev, hash,
      sealedAt: d.sealedAt, sealTx: hashOf('seal', hash), outcome: d.outcome,
      revealedAt: d.revealedAt, revealTx: d.revealedAt ? hashOf('reveal', hash) : undefined,
    }
    prev = hash
    return r
  })
}

const day = (d: number) => Date.UTC(2026, 9, d)
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10)
const money = (v: number, dp: number) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })

// ---------- Daybreak: the built-in demo agent (PRD §5.2) ----------
export const DAYBREAK_ABOUT = 'Notary’s demo agent. Seals five daily closing-price claims at 06:00 UTC and reveals them after the close.'
export const MARKETS = [
  { pair: 'BTC/USD', start: 67180, step: 0.018, dp: 2, falses: 2 },
  { pair: 'ETH/USD', start: 2612, step: 0.024, dp: 2, falses: 2 },
  { pair: 'SOL/USD', start: 168.4, step: 0.035, dp: 2, falses: 3 },
  { pair: 'BNB/USD', start: 591.2, step: 0.016, dp: 2, falses: 2 },
  { pair: 'XRP/USD', start: 0.5236, step: 0.028, dp: 4, falses: 2 },
] as const

const DAYBREAK_DAYS = 9 // 20 Oct to 28 Oct; the 28 Oct claims close on the 29th and are still sealed

function daybreakDrafts(): Draft[] {
  const rand = rng(677)
  const prices = MARKETS.map((m) => m.start)
  const falses = MARKETS.map((m) => falseSet(DAYBREAK_DAYS - 1, m.falses, rand))
  const drafts: Draft[] = []
  for (let d = 0; d < DAYBREAK_DAYS; d++) {
    const sealDay = day(20 + d)
    MARKETS.forEach((m, mi) => {
      prices[mi] *= 1 + (rand() - 0.48) * m.step
      const above = rand() > 0.42
      const level = prices[mi] * (above ? 0.996 : 1.004)
      const closes = isoDay(sealDay + DAY)
      const revealed = d < DAYBREAK_DAYS - 1
      drafts.push({
        sealedAt: sealDay + 6 * HOUR + mi * 1000,
        revealedAt: revealed ? sealDay + DAY + 5 * 60_000 + mi * 1000 : undefined,
        category: m.pair,
        claimText: `${m.pair} closes ${above ? 'above' : 'below'} ${money(level, m.dp)} on ${closes} at 00:00 UTC`,
        outcome: revealed ? (falses[mi].has(d) ? 'false' : 'true') : 'sealed',
      })
    })
  }
  return drafts
}

// ---------- the other sample agents ----------
interface Plan {
  name: string
  kind: string
  about: string
  registered: number
  seed: number
  total: number
  revealed: number
  trues: number
  minDelay: number // hours from seal to reveal
  maxDelay: number
  claim: (i: number, sealedAt: number, rand: () => number) => { category: string; text: string }
}

const PLANS: Plan[] = [
  {
    name: 'Tidewatch', kind: 'Governance votes', registered: Date.UTC(2026, 9, 21, 10, 2), seed: 11,
    about: 'Calls the result and turnout of DAO proposals before voting opens.',
    total: 16, revealed: 14, trues: 10, minDelay: 30, maxDelay: 60,
    claim: (i, t, r) => {
      const dao = ['Harbor DAO', 'Quarry DAO', 'Lumen Treasury'][i % 3]
      const pass = r() > 0.35
      return { category: 'Governance', text: `${dao} proposal ${40 + i} ${pass ? 'passes' : 'fails'} with turnout above ${Math.round(18 + r() * 20)}% when voting closes ${isoDay(t + 2 * DAY)}` }
    },
  },
  {
    name: 'Kestrel Risk', kind: 'Liquidity flags', registered: Date.UTC(2026, 9, 20, 14, 40), seed: 23,
    about: 'Flags pools likely to lose a fifth of their liquidity within two days.',
    total: 15, revealed: 13, trues: 8, minDelay: 44, maxDelay: 49,
    claim: (i, t) => {
      const pool = ['BOT/USDT on Quarry Swap', 'WETH/BOT on Tidepool', 'USDC/BOT on Quarry Swap', 'BOT/WBTC on Tidepool'][i % 4]
      return { category: 'Liquidity', text: `${pool} loses more than 20% of its liquidity before ${new Date(t + 48 * HOUR).toISOString().slice(0, 16).replace('T', ' ')} UTC` }
    },
  },
  {
    name: 'Ledgerline', kind: 'Network fees', registered: Date.UTC(2026, 9, 21, 8, 15), seed: 37,
    about: 'Predicts the next day’s median transaction fee on BOT Chain.',
    total: 14, revealed: 12, trues: 7, minDelay: 25, maxDelay: 28,
    claim: (_i, t, r) => ({ category: 'Fees', text: `Median BOT Chain transaction fee on ${isoDay(t + DAY)} stays under ${(0.00002 + r() * 0.00003).toFixed(6)} BOT` }),
  },
  {
    name: 'Orrery', kind: 'Software releases', registered: Date.UTC(2026, 9, 22, 16, 30), seed: 41,
    about: 'Predicts whether open-source projects ship their announced releases on time.',
    total: 9, revealed: 6, trues: 5, minDelay: 36, maxDelay: 72,
    claim: (i, t) => {
      const repo = ['harbor-labs/bridge', 'quarry-swap/core', 'lumen/wallet', 'tidepool/router'][i % 4]
      return { category: 'Releases', text: `${repo} tags release v${2 + (i % 3)}.${i} on GitHub before ${isoDay(t + 3 * DAY)} 23:59 UTC` }
    },
  },
  {
    name: 'Quillon', kind: 'Audit deadlines', registered: Date.UTC(2026, 9, 27, 11, 5), seed: 53,
    about: 'Predicts whether announced security audits are published by their stated date.',
    total: 2, revealed: 0, trues: 0, minDelay: 96, maxDelay: 120,
    claim: (i, t) => ({ category: 'Audits', text: `The ${['Quarry Swap v3', 'Lumen wallet'][i]} audit report is published before ${isoDay(t + 5 * DAY)}` }),
  },
]

function planDrafts(p: Plan): Draft[] {
  const rand = rng(p.seed)
  const falses = falseSet(p.revealed, p.revealed - p.trues, rand)
  // Revealed receipts were sealed early enough for their outcome to be known; the rest are recent.
  const start = p.registered + HOUR
  const end = SAMPLE_NOW - 2 * HOUR
  const split = Math.max(start, end - p.minDelay * HOUR)
  const span = (a: number, b: number, n: number) => Array.from({ length: n }, () => a + rand() * (b - a)).sort((x, y) => x - y)
  const times = [...span(start, split, p.revealed), ...span(split, end, p.total - p.revealed)]
  return times.map((sealedAt, i) => {
    const revealed = i < p.revealed
    const delay = (p.minDelay + rand() * (p.maxDelay - p.minDelay)) * HOUR
    const c = p.claim(i, sealedAt, rand)
    return {
      sealedAt,
      revealedAt: revealed ? Math.min(sealedAt + delay, SAMPLE_NOW - (p.revealed - i) * 7 * 60_000) : undefined,
      category: c.category, claimText: c.text,
      outcome: revealed ? (falses.has(i) ? 'false' : 'true') : 'sealed',
    }
  })
}

function makeAgent(name: string, kind: string, about: string, registeredAt: number, demo = false): Agent {
  const slug = name.toLowerCase().replace(/\s+/g, '-')
  return {
    id: addressOf(name), name, kind, about, demo, registeredAt,
    metadataURI: `ipfs://bafybei${hashOf('meta', name).slice(2, 40)}/${slug}.json`,
    registerTx: hashOf('register', name),
  }
}

export function buildSample(): Register {
  const daybreak = makeAgent('Daybreak', 'Crypto prices', DAYBREAK_ABOUT, Date.UTC(2026, 9, 20, 5, 40), true)
  const agents = [daybreak]
  const receipts = chain(daybreak, daybreakDrafts())
  for (const p of PLANS) {
    const a = makeAgent(p.name, p.kind, p.about, p.registered)
    agents.push(a)
    receipts.push(...chain(a, planDrafts(p)))
  }

  const db = receipts.filter((r) => r.agentId === daybreak.id)
  console.assert(db.length === 45, 'Daybreak seals 5 claims a day for 9 days')
  console.assert(db.filter((r) => r.outcome !== 'sealed').length === 40, 'Daybreak has 40 reveals')
  console.assert(db.filter((r) => r.outcome === 'true').length === 29, 'Daybreak has 29 true')
  for (const r of receipts) console.assert(!r.revealedAt || (r.revealedAt > r.sealedAt && r.revealedAt <= SAMPLE_NOW), 'reveal follows seal', r)

  return { mode: 'sample', loadedAt: SAMPLE_NOW, agents, receipts }
}
