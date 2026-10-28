import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPublicClient, http, type Address, type Hex } from 'viem'
import { botChain, FROM_BLOCK, LIVE, NOTARY_ADDRESS, notaryAbi } from '../lib/chain'
import { buildSample } from './sample'
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
async function readChain(): Promise<Register> {
  const client = createPublicClient({ chain: botChain, transport: http() })
  const range = { address: NOTARY_ADDRESS!, fromBlock: FROM_BLOCK, toBlock: 'latest' as const }
  const [registered, sealed, revealed] = await Promise.all([
    client.getContractEvents({ abi: notaryAbi, eventName: 'AgentRegistered', ...range }),
    client.getContractEvents({ abi: notaryAbi, eventName: 'ReceiptSealed', ...range }),
    client.getContractEvents({ abi: notaryAbi, eventName: 'ReceiptRevealed', ...range }),
  ])
  const blockTimes = new Map<bigint, number>()
  const timeOf = async (n: bigint) => {
    if (!blockTimes.has(n)) blockTimes.set(n, Number((await client.getBlock({ blockNumber: n })).timestamp) * 1000)
    return blockTimes.get(n)!
  }
  const agents: Agent[] = await Promise.all(registered.map(async (e) => ({
    id: e.args.agentId as Address, name: e.args.name ?? 'Unnamed agent', kind: '', about: '',
    metadataURI: e.args.metadataURI ?? '', registeredAt: await timeOf(e.blockNumber), registerTx: e.transactionHash,
  })))
  const reveals = new Map(revealed.map((e) => [`${e.args.agentId}:${e.args.receiptId}`, e]))
  const receipts: Receipt[] = await Promise.all(sealed.map(async (e) => {
    const rv = reveals.get(`${e.args.agentId}:${e.args.receiptId}`)
    return {
      agentId: e.args.agentId as Address, id: Number(e.args.receiptId), category: e.args.category ?? '',
      claimText: rv?.args.claimText ?? '', nonce: '0x' as Hex, prevHash: e.args.prevHash as Hex, hash: e.args.receiptHash as Hex,
      sealedAt: await timeOf(e.blockNumber), sealTx: e.transactionHash,
      outcome: rv ? (rv.args.outcome ? 'true' : 'false') : 'sealed',
      revealedAt: rv ? await timeOf(rv.blockNumber) : undefined, revealTx: rv?.transactionHash,
    }
  }))
  for (const a of agents) a.kind = receipts.find((r) => r.agentId === a.id)?.category ?? ''
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
