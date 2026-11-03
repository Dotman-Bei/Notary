import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { claimFor, MARKETS, outcomeOf } from '../src/daybreak.mjs'
import { receiptHash, ZERO_HASH } from '../src/registry.mjs'
import { openStore } from '../src/store.mjs'

test('receiptHash matches the contract (test_hashMatchesViem)', () => {
  const h = receiptHash('0x226Ce414999F67C02B9404FC7F1276D860eabDc9', 'ETH/USD closes above 2,640.00 on 2026-10-30 at 00:00 UTC', `0x${'ab'.repeat(32)}`, ZERO_HASH)
  assert.equal(h, '0x90e79f53452aae9863c55edf1083719aabc271ec2bea31081c913aca7716dcc8')
})

test('store round-trips encrypted and refuses a wrong key or another agent', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'notary-')), 'r.enc')
  const agent = '0x226Ce414999F67C02B9404FC7F1276D860eabDc9'
  const s = openStore(path, 'correct horse battery', agent)
  s.add({ id: 1, status: 'sealed', claimText: 'secret claim', nonce: '0x01' })
  assert.ok(!readFileSync(path, 'utf8').includes('secret claim'))
  assert.equal(openStore(path, 'correct horse battery', agent).byId(1).claimText, 'secret claim')
  assert.throws(() => openStore(path, 'wrong passphrase!!', agent), /Cannot decrypt/)
  assert.throws(() => openStore(path, 'correct horse battery', '0x0000000000000000000000000000000000000001'), /belongs to agent/)
})

test('Daybreak claims follow the 24h move and resolve strictly', () => {
  const close = Date.UTC(2026, 10, 4)
  const up = claimFor(MARKETS[0], { usd: 77229, change24h: 0.5 }, close)
  assert.equal(up.text, 'BTC/USD closes above 76,920.08 on 2026-11-04 at 00:00 UTC')
  assert.equal(outcomeOf(up, 76920.09), true)
  assert.equal(outcomeOf(up, 76920.08), false)
  const down = claimFor(MARKETS[4], { usd: 1.27, change24h: -2 }, close)
  assert.equal(down.text, 'XRP/USD closes below 1.2751 on 2026-11-04 at 00:00 UTC')
  assert.equal(outcomeOf(down, 1.275), true)
})
