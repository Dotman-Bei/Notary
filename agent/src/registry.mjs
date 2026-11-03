import { randomBytes } from 'node:crypto'
import { createPublicClient, createWalletClient, defineChain, encodePacked, formatEther, http, keccak256, parseEventLogs, parseGwei, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { notaryAbi } from './abi.mjs'

export const ZERO_HASH = `0x${'0'.repeat(64)}`
const STATUS = ['none', 'sealed', 'true', 'false']

// receiptHash = keccak256(abi.encodePacked(agentId, claimText, nonce, prevHash)), as NotaryRegistry.computeReceiptHash.
export const receiptHash = (agent, claimText, nonce, prevHash) =>
  keccak256(encodePacked(['address', 'string', 'bytes32', 'bytes32'], [agent, claimText, nonce, prevHash]))

export async function connect(cfg, { log = console.log } = {}) {
  const chain = defineChain({
    id: cfg.chainId,
    name: cfg.chainId === 677 ? 'BOT Chain' : `Chain ${cfg.chainId}`,
    nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  })
  const transport = http(cfg.rpcUrl, { retryCount: 3, timeout: 20_000 })
  const pub = createPublicClient({ chain, transport })
  const account = cfg.privateKey ? privateKeyToAccount(cfg.privateKey) : null
  const wallet = account ? createWalletClient({ chain, transport, account }) : null

  const actual = await pub.getChainId()
  if (actual !== cfg.chainId) throw new Error(`The RPC at ${cfg.rpcUrl} is chain ${actual}, expected ${cfg.chainId}.`)
  const code = await pub.getCode({ address: cfg.registry })
  if (!code || code === '0x') throw new Error(`No contract at ${cfg.registry} on chain ${actual}.`)

  const c = { address: cfg.registry, abi: notaryAbi }
  const read = (functionName, args = []) => pub.readContract({ ...c, functionName, args })
  const gasPrice = parseGwei(cfg.gasGwei)

  // Simulate first so a revert is reported by name and nothing is spent, then send at the gas floor.
  async function send(functionName, args) {
    const { request, result } = await pub.simulateContract({ ...c, functionName, args, account })
    const hash = await wallet.writeContract({ ...request, type: 'legacy', gasPrice })
    return { hash, result }
  }
  async function confirm(hash) {
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 })
    if (receipt.status !== 'success') throw new Error(`Transaction ${hash} reverted.`)
    const fee = receipt.gasUsed * (receipt.effectiveGasPrice ?? gasPrice)
    log(`  confirmed in block ${receipt.blockNumber}, ${receipt.gasUsed} gas, ${formatEther(fee)} BOT`)
    return receipt
  }

  const api = {
    chain,
    pub,
    agent: account?.address,
    read,
    balance: () => pub.getBalance({ address: account.address }),
    isRegistered: (id = account.address) => read('isRegistered', [id]),
    profile: (id = account.address) => read('getAgentProfile', [id]),
    async receipts(id = account.address) {
      const total = Number((await api.profile(id)).receiptCount)
      const out = []
      for (let from = 1; from <= total; from += 100) out.push(...(await read('getReceipts', [id, BigInt(from), 100n])))
      return out.map((r, i) => ({ id: i + 1, hash: r.receiptHash, prevHash: r.prevHash, status: STATUS[r.status], category: r.category, claimText: r.claimText, sealedAt: Number(r.sealedAt), revealedAt: Number(r.revealedAt) }))
    },

    async register(name, metadataURI) {
      const { hash } = await send('registerAgent', [name, metadataURI])
      log(`  registerAgent sent: ${hash}`)
      await confirm(hash)
      return hash
    },

    // Seals one claim. The entry (with plaintext and nonce) is in the store before the transaction leaves.
    async seal(store, { claimText, category, extra = {} }) {
      const head = (await api.profile()).head
      const nonce = toHex(randomBytes(32))
      const hash = receiptHash(account.address, claimText, nonce, head)
      const entry = store.add({ status: 'pending', hash, prevHash: head, claimText, nonce, category, createdAt: Date.now(), ...extra })
      const sent = await send('commitReceipt', [hash, category])
      entry.sealTx = sent.hash
      store.save()
      log(`  commitReceipt sent: ${sent.hash}`)
      const receipt = await confirm(sent.hash)
      const [ev] = parseEventLogs({ abi: notaryAbi, logs: receipt.logs, eventName: 'ReceiptSealed' })
      entry.id = Number(ev.args.receiptId)
      entry.status = 'sealed'
      entry.sealedAt = Date.now()
      store.save()
      return entry
    },

    async reveal(store, entry, outcome) {
      const onChain = await read('getReceipt', [account.address, BigInt(entry.id)])
      if (STATUS[onChain.status] !== 'sealed') throw new Error(`Receipt #${entry.id} is already revealed on chain (${STATUS[onChain.status]}).`)
      const check = receiptHash(account.address, entry.claimText, entry.nonce, onChain.prevHash)
      if (check !== onChain.receiptHash) throw new Error(`The stored claim for #${entry.id} does not reproduce its sealed hash; not sending.`)
      const { hash } = await send('revealReceipt', [BigInt(entry.id), entry.claimText, entry.nonce, outcome])
      entry.revealTx = hash
      store.save()
      log(`  revealReceipt sent: ${hash}`)
      await confirm(hash)
      entry.status = 'revealed'
      entry.outcome = outcome
      entry.revealedAt = Date.now()
      store.save()
      return entry
    },

    // Brings the store in line with the chain after a crash or a lost connection:
    // a pending entry whose hash is on chain gets its id; one that can no longer land is dropped.
    async reconcile(store) {
      const chain = await api.receipts()
      const byHash = new Map(chain.map((r) => [r.hash, r]))
      const head = chain.length ? chain[chain.length - 1].hash : ZERO_HASH
      let changed = false
      for (const e of store.data.receipts) {
        const on = byHash.get(e.hash)
        if (e.status === 'pending') {
          if (on) { e.id = on.id; e.status = 'sealed'; e.sealedAt = on.sealedAt * 1000; changed = true }
          else if (e.prevHash !== head) { e.status = 'dropped'; changed = true } // the chain moved past it
          else if (e.sealTx) {
            const r = await pub.getTransactionReceipt({ hash: e.sealTx }).catch(() => null)
            if (r?.status === 'reverted') { e.status = 'dropped'; changed = true }
          }
        }
        if (e.status === 'sealed' && on && on.status !== 'sealed') {
          e.status = 'revealed'; e.outcome = on.status === 'true'; e.revealedAt = on.revealedAt * 1000; changed = true
        }
      }
      if (changed) store.save()
      return chain
    },
  }
  return api
}
