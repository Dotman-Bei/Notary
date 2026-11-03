import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAddress, isHex } from 'viem'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// BOT Chain mainnet (dev-docs.botchain.ai, checked 2026-11-03) and the registry deployed in block 28,960,218.
const DEFAULTS = {
  NOTARY_ADDRESS: '0xf1098FBfAb8F3A629e01E1F3FcbeF295E840BDab',
  NOTARY_RPC_URL: 'https://rpc.botchain.ai',
  NOTARY_CHAIN_ID: '677',
  NOTARY_GAS_GWEI: '20', // the chain's floor: 19 gwei is refused with "gasPrice too low"
  NOTARY_STORE: 'data/receipts.enc',
}

export function loadConfig({ needKey = true } = {}) {
  const envFile = resolve(ROOT, '.env')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const env = (k) => process.env[k] || DEFAULTS[k] || ''

  const privateKey = env('PRIVATE_KEY')
  if (needKey && !(isHex(privateKey) && privateKey.length === 66)) {
    throw new Error('PRIVATE_KEY in agent/.env must be 0x followed by 64 hex characters.')
  }
  const storeKey = env('NOTARY_STORE_KEY')
  if (needKey && storeKey.length < 16) throw new Error('NOTARY_STORE_KEY in agent/.env must be at least 16 characters.')

  const address = env('NOTARY_ADDRESS')
  if (!isAddress(address)) throw new Error(`NOTARY_ADDRESS is not an address: ${address}`)

  return {
    privateKey,
    storeKey,
    registry: address,
    rpcUrl: env('NOTARY_RPC_URL'),
    chainId: Number(env('NOTARY_CHAIN_ID')),
    gasGwei: env('NOTARY_GAS_GWEI'),
    storePath: resolve(ROOT, env('NOTARY_STORE')),
    // Test hook only: pretend the clock reads this ISO time (the fork test uses it to reach a close).
    fakeNow: process.env.NOTARY_FAKE_NOW ? Date.parse(process.env.NOTARY_FAKE_NOW) : null,
  }
}

export const nowMs = (cfg) => cfg.fakeNow ?? Date.now()
