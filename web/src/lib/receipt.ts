import { encodePacked, keccak256, type Address, type Hex } from 'viem'

export const ZERO_HASH: Hex = `0x${'0'.repeat(64)}`

// receiptHash = keccak256(agentId ‖ claimText ‖ nonce ‖ prevReceiptHash), PRD §5.1 and §7.
export function receiptHash(agentId: Address, claimText: string, nonce: Hex, prevHash: Hex): Hex {
  return keccak256(encodePacked(['address', 'string', 'bytes32', 'bytes32'], [agentId, claimText, nonce, prevHash]))
}

export function shortHash(hash: string, head = 6, tail = 4) {
  return hash.length <= head + tail + 2 ? hash : `${hash.slice(0, head + 2)}…${hash.slice(-tail)}`
}
