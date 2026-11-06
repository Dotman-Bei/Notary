import type { Address, Hex } from 'viem'
import { CHAIN_ID, NOTARY_ADDRESS } from './chain'

// Claims sealed from this browser. The chain only holds the hash, so without the text and nonce a
// receipt can never be revealed. Each entry is saved before its seal is sent, as the runner does.
export interface SavedClaim {
  hash: Hex
  claimText: string
  nonce: Hex
  category: string
  savedAt: number
}

const keyOf = (agent: Address) => `notary.claims.v1.${CHAIN_ID}.${agent.toLowerCase()}`

export function loadClaims(agent: Address): SavedClaim[] {
  try {
    const raw = localStorage.getItem(keyOf(agent))
    return raw ? (JSON.parse(raw) as SavedClaim[]) : []
  } catch {
    return []
  }
}

/** False when the browser refused to store it; the caller must not seal in that case. */
export function saveClaim(agent: Address, claim: SavedClaim): boolean {
  try {
    localStorage.setItem(keyOf(agent), JSON.stringify([...loadClaims(agent), claim]))
    return loadClaims(agent).some((c) => c.hash === claim.hash)
  } catch {
    return false
  }
}

export function removeClaim(agent: Address, hash: Hex) {
  try {
    localStorage.setItem(keyOf(agent), JSON.stringify(loadClaims(agent).filter((c) => c.hash !== hash)))
  } catch { /* a leftover entry is harmless: it is only ever looked up by hash */ }
}

export const findClaim = (agent: Address, hash: Hex) => loadClaims(agent).find((c) => c.hash === hash)

export function downloadBackup(agent: Address) {
  const body = JSON.stringify({ agent, chainId: CHAIN_ID, registry: NOTARY_ADDRESS, claims: loadClaims(agent) }, null, 2)
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `notary-claims-${agent.slice(0, 8)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
