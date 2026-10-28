import { defineChain, type Address } from 'viem'

// BOT Chain mainnet, checked 2026-10-28 against https://chainlist.org/chain/677.
// Chainlist lists no public RPC, so the RPC URL is never hardcoded: it comes from VITE_BOT_RPC_URL.
export const CHAIN_ID = 677
export const CHAIN_ID_HEX = '0x2a5'
export const EXPLORER = 'https://scan.botchain.ai'

const env = import.meta.env
export const RPC_URL: string | undefined = env.VITE_BOT_RPC_URL || undefined
export const NOTARY_ADDRESS: Address | undefined = env.VITE_NOTARY_ADDRESS || undefined
export const FROM_BLOCK: bigint = BigInt(env.VITE_NOTARY_FROM_BLOCK || 0)

// The app reads the chain only when both are configured; otherwise it renders the sample register.
export const LIVE = Boolean(RPC_URL && NOTARY_ADDRESS)

export const botChain = defineChain({
  id: CHAIN_ID,
  name: 'BOT Chain Mainnet',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: { default: { http: RPC_URL ? [RPC_URL] : [] } },
  blockExplorers: { default: { name: 'botscan', url: EXPLORER } },
})

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`

// Must match NotaryRegistry.sol (PRD §5.1). Update the events here if the contract's signatures change.
export const notaryAbi = [
  { type: 'function', name: 'registerAgent', stateMutability: 'nonpayable', inputs: [{ name: 'name', type: 'string' }, { name: 'metadataURI', type: 'string' }], outputs: [] },
  { type: 'function', name: 'commitReceipt', stateMutability: 'nonpayable', inputs: [{ name: 'receiptHash', type: 'bytes32' }, { name: 'category', type: 'string' }], outputs: [] },
  { type: 'function', name: 'revealReceipt', stateMutability: 'nonpayable', inputs: [{ name: 'receiptId', type: 'uint256' }, { name: 'claimText', type: 'string' }, { name: 'nonce', type: 'bytes32' }, { name: 'outcome', type: 'bool' }], outputs: [] },
  { type: 'event', name: 'AgentRegistered', inputs: [{ name: 'agentId', type: 'address', indexed: true }, { name: 'owner', type: 'address', indexed: true }, { name: 'name', type: 'string', indexed: false }, { name: 'metadataURI', type: 'string', indexed: false }] },
  { type: 'event', name: 'ReceiptSealed', inputs: [{ name: 'agentId', type: 'address', indexed: true }, { name: 'receiptId', type: 'uint256', indexed: true }, { name: 'receiptHash', type: 'bytes32', indexed: false }, { name: 'prevHash', type: 'bytes32', indexed: false }, { name: 'category', type: 'string', indexed: false }] },
  { type: 'event', name: 'ReceiptRevealed', inputs: [{ name: 'agentId', type: 'address', indexed: true }, { name: 'receiptId', type: 'uint256', indexed: true }, { name: 'outcome', type: 'bool', indexed: false }, { name: 'claimText', type: 'string', indexed: false }] },
] as const
