import type { Address, Hex } from 'viem'

export type Outcome = 'sealed' | 'true' | 'false'

export interface Agent {
  id: Address // agentId = the owner's address (PRD §5.1)
  name: string
  kind: string // what it makes claims about, in the trade's words
  about: string
  metadataURI: string
  registeredAt: number
  registerTx: Hex
  demo?: boolean
}

export interface Receipt {
  agentId: Address
  id: number // per-agent receipt id, from 1
  category: string
  claimText: string // known on-chain only after reveal
  nonce: Hex
  prevHash: Hex
  hash: Hex
  sealedAt: number
  sealTx: Hex
  outcome: Outcome
  revealedAt?: number
  revealTx?: Hex
}

export interface AgentStats {
  agent: Agent
  receipts: Receipt[] // oldest first
  revealed: number
  trues: number
  falses: number
  awaiting: number
  accuracy: number | null // null when nothing is revealed: no score, no 0%
  head: Hex
  lastSealedAt: number | null
}

export interface FeedEvent {
  type: 'sealed' | 'revealed'
  at: number
  agent: Agent
  receipt: Receipt
}

export interface Register {
  mode: 'sample' | 'live'
  loadedAt: number
  agents: Agent[]
  receipts: Receipt[]
}
