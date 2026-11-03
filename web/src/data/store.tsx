import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPublicClient, http, type Address, type Hex } from 'viem'
import { botChain, DAYBREAK_ADDRESS, LIVE, NOTARY_ADDRESS, notaryAbi } from '../lib/chain'
import { buildSample, DAYBREAK_ABOUT } from './sample'
import type { Agent, AgentStats, FeedEvent, Receipt, Register } from './types'

// Sample data is a snapshot, so relative times count from when it was taken.
export const nowOf = (r: Register) => (r.mode === 'sample' ? r.loadedAt : Date.now())

export const MIN_REVEALS = 10 // an agent ranks after this many revealed receipts (PRD §5.3 "min. N")

export function statsFor(agent: Agent, all: Receipt[]): AgentStats {
  const receipts = all.filter((r) => r.agentId === agent.id).sort((a, b) => a.id - b.id)
  const trues = receipts.filter((r) => r.outcome === 'true').length
  const falses = receipts.filter((r) => r.outcome === 'false').length
  const revealed = trues + falses
  const last = receipts.at(-1)
  return {
    agent, receipts, trues, falses, revealed,
    awaiting: receipts.length - revealed,
    accuracy: revealed ? trues / revealed : null,
    head: last?.hash ?? (`0x${'0'.repeat(64)}` as Hex),
    lastSealedAt: last?.sealedAt ?? null,
  }
}

export function leaderboard(reg: Register) {
  const all = reg.agents.map((a) => statsFor(a, reg.receipts))
  const ranked = all
    .filter((s) => s.revealed >= MIN_REVEALS)
    .sort((a, b) => b.accuracy! - a.accuracy! || b.revealed - a.revealed)
  const unranked = all.filter((s) => s.revealed < MIN_REVEALS).sort((a, b) => b.revealed - a.revealed || b.receipts.length - a.receipts.length)
  return { ranked, unranked, all }
}

export function feed(reg: Register): FeedEvent[] {
  const byId = new Map(reg.agents.map((a) => [a.id, a]))
  const events: FeedEvent[] = []
  for (const r of reg.receipts) {
    const agent = byId.get(r.agentId)!
    events.push({ type: 'sealed', at: r.sealedAt, agent, receipt: r })
    if (r.revealedAt) events.push({ type: 'revealed', at: r.revealedAt, agent, receipt: r })
  }
  return events.sort((a, b) => b.at - a.at || (a.type === 'revealed' ? -1 : 1))
}

// ---------- live reads from NotaryRegistry ----------
// BOT Chain's public RPC disables eth_getLogs, so the register is read through view calls, batched over HTTP.
const PAGE = 100 // NotaryRegistry.MAX_PAGE
const OUTCOME = ['sealed', 'sealed', 'true', 'false'] as const // Status: None, Sealed, True, False

async function readChain(): Promise<Register> {
  const client = createPublicClient({ chain: botChain, transport: http(undefined, { batch: true }) })
  const c = { address: NOTARY_ADDRESS!, abi: notaryAbi } as const

  const count = Number(await client.readContract({ ...c, functionName: 'agentCount' }))
  const idPages = await Promise.all(
    Array.from({ length: Math.ceil(count / PAGE) }, (_, p) => client.readContract({ ...c, functionName: 'getAgents', args: [BigInt(p * PAGE), BigInt(PAGE)] })),
  )
  const ids = idPages.flat()
  const profiles = await Promise.all(ids.map((id) => client.readContract({ ...c, functionName: 'getAgentProfile', args: [id] })))

  const receipts: Receipt[] = []
  await Promise.all(ids.map(async (id, i) => {
    const total = Number(profiles[i].receiptCount)
    const pages = await Promise.all(
      Array.from({ length: Math.ceil(total / PAGE) }, (_, p) => client.readContract({ ...c, functionName: 'getReceipts', args: [id, BigInt(p * PAGE + 1), BigInt(PAGE)] })),
    )
    pages.flat().forEach((r, k) => {
      const outcome = OUTCOME[r.status]
      receipts.push({
        agentId: id, id: k + 1, category: r.category, claimText: r.claimText,
        nonce: '0x' as Hex, prevHash: r.prevHash, hash: r.receiptHash,
        sealedAt: Number(r.sealedAt) * 1000, sealTx: '' as Hex, outcome,
        revealedAt: outcome === 'sealed' ? undefined : Number(r.revealedAt) * 1000,
      })
    })
  }))

  const agents: Agent[] = ids.map((id, i) => {
    const demo = id.toLowerCase() === DAYBREAK_ADDRESS.toLowerCase()
    return {
      id: id as Address, name: profiles[i].name, metadataURI: profiles[i].metadataURI,
      registeredAt: Number(profiles[i].registeredAt) * 1000, registerTx: '' as Hex,
      kind: demo ? 'Crypto prices' : receipts.find((r) => r.agentId === id)?.category ?? '',
      about: demo ? DAYBREAK_ABOUT : '', demo,
    }
  })
  return { mode: 'live', loadedAt: Date.now(), agents, receipts }
}

interface RegisterState {
  register: Register | null
  error: string | null
  refreshing: boolean
  refresh: () => void
}

const Ctx = createContext<RegisterState | null>(null)

export function RegisterProvider({ children }: { children: ReactNode }) {
  const [register, setRegister] = useState<Register | null>(() => (LIVE ? null : buildSample()))
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(() => {
    if (!LIVE) return
    setRefreshing(true)
    readChain()
      .then((r) => { setRegister(r); setError(null) })
      .catch((e: Error) => setError(e.message.split('\n')[0]))
      .finally(() => setRefreshing(false))
  }, [])

  useEffect(() => {
    if (!LIVE) return
    refresh()
    const t = setInterval(refresh, 15_000)
    return () => clearInterval(t)
  }, [refresh])

  const value = useMemo(() => ({ register, error, refreshing, refresh }), [register, error, refreshing, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRegister() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useRegister outside RegisterProvider')
  return v
}
