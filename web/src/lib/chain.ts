import { defineChain, type Address } from 'viem'

// BOT Chain mainnet: chain 677 on chainlist.org, RPC and explorer from
// dev-docs.botchain.ai/docs/Developers/json-rpc-endpoint and /quick-guide (checked 2026-11-03).
// That RPC disables eth_getLogs, so the app reads the registry through its view functions only.
export const CHAIN_ID = 677
export const CHAIN_ID_HEX = '0x2a5'
export const EXPLORER = 'https://scan.botchain.ai'
export const BOT_CHAIN_SITE = 'https://www.botchain.ai'
const DEFAULT_RPC = 'https://rpc.botchain.ai'

const env = import.meta.env
export const RPC_URL: string = env.VITE_BOT_RPC_URL || DEFAULT_RPC
export const NOTARY_ADDRESS: Address | undefined = env.VITE_NOTARY_ADDRESS || undefined

// The app reads the chain once the contract address is set; otherwise it renders the sample register.
export const LIVE = Boolean(NOTARY_ADDRESS)

// Daybreak, the built-in demo agent run by agent/ (notary.mjs daybreak run). Matched by address, not
// name, since anyone can register an agent called Daybreak.
export const DAYBREAK_ADDRESS: Address = env.VITE_DAYBREAK_ADDRESS || '0x9D2d1C511D72195D4Ad9b2fB87b5DDb3BB426827'

// The project's own smoke-test wallets ("Test wallet 1" to 7). They stay on chain and in the commit
// feed, but are left out of the home page and the leaderboard page.
export const TEST_WALLETS = new Set([
  '0x48c5fa23f826713f886e940ce04c34a3ba50e5a9',
  '0xf7d2035a8c4f76faab3c7ac69d24f8c70fea2c96',
  '0xadf9d9857952667a825b3d83527bfbcc89b14f24',
  '0xfba116fec0e41b29d7e5ccadb3f967a9f9fcf235',
  '0xbd47226848560f28527efae5beada52126996ca9',
  '0x53e94e9e23d7e3e25a489d1896caf9b714c57e8e',
  '0x086f6ebc087034c7f842a2bdc6a677f1849c5638',
])

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
