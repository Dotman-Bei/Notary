import { defineChain, type Address } from 'viem'

// BOT Chain mainnet: chain 677 on chainlist.org, RPC and explorer from
// dev-docs.botchain.ai/docs/Developers/json-rpc-endpoint and /quick-guide (checked 2026-11-03).
// That RPC disables eth_getLogs, so the app reads the registry through its view functions only.
export const CHAIN_ID = 677
export const CHAIN_ID_HEX = '0x2a5'
export const EXPLORER = 'https://scan.botchain.ai'
const DEFAULT_RPC = 'https://rpc.botchain.ai'

const env = import.meta.env
export const RPC_URL: string = env.VITE_BOT_RPC_URL || DEFAULT_RPC
export const NOTARY_ADDRESS: Address | undefined = env.VITE_NOTARY_ADDRESS || undefined

// The app reads the chain once the contract address is set; otherwise it renders the sample register.
export const LIVE = Boolean(NOTARY_ADDRESS)

// Daybreak, the built-in demo agent run by agent/ (notary.mjs daybreak run). Matched by address, not
// name, since anyone can register an agent called Daybreak.
export const DAYBREAK_ADDRESS: Address = env.VITE_DAYBREAK_ADDRESS || '0x9D2d1C511D72195D4Ad9b2fB87b5DDb3BB426827'

export const botChain = defineChain({
  id: CHAIN_ID,
  name: 'BOT Chain Mainnet',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'botscan', url: EXPLORER } },
})

// View calls cannot return transaction hashes; without one, link to the registry contract instead.
export const txUrl = (hash: string | undefined) =>
  hash ? `${EXPLORER}/tx/${hash}` : NOTARY_ADDRESS ? `${EXPLORER}/address/${NOTARY_ADDRESS}` : EXPLORER
export const txLabel = (hash: string | undefined) =>
  hash ? `transaction ${hash.slice(0, 8)}…${hash.slice(-4)} on botscan` : 'NotaryRegistry on botscan'
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`

export { notaryAbi } from './notaryAbi'
