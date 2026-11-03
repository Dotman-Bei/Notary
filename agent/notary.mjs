#!/usr/bin/env node
// Notary agent runner. Run `node notary.mjs help` for the commands.
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'
import { formatEther } from 'viem'
import { loadConfig, nowMs } from './src/config.mjs'
import * as daybreak from './src/daybreak.mjs'
import { connect } from './src/registry.mjs'
import { openStore } from './src/store.mjs'

const HELP = `Usage: node notary.mjs <command>

  status                      Agent, balance, chain head, and the store's receipts
  register <name> [uri]       Register this key as an agent (one transaction, once)
  seal <category> <claim…>    Seal one claim; its text and nonce go to the encrypted store
  reveal <id> <true|false>    Reveal receipt #id from the store with its outcome
  show <id>                   Print a stored claim and nonce (for the web app's reveal form)
  daybreak register           Register this key as Daybreak, the demo agent
  daybreak tick               Seal today's claims if due, reveal any past their close, then exit
  daybreak run                Tick every minute until stopped (Ctrl+C)

Settings are read from agent/.env (see .env.example).`

const [cmd, ...args] = process.argv.slice(2)
const log = (...a) => console.log(...a)
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19)

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help') return log(HELP)
  const cfg = loadConfig()
  const api = await connect(cfg)
  const unlock = lock(`${cfg.storePath}.lock`)
  try {
    const store = openStore(cfg.storePath, cfg.storeKey, api.agent)
    await run(cfg, api, store)
  } finally {
    unlock()
  }
}

async function run(cfg, api, store) {
  const registered = await api.isRegistered()
  const needRegistered = () => { if (!registered) throw new Error(`${api.agent} is not registered. Run: node notary.mjs register <name>  (or daybreak register)`) }

  switch (cmd) {
    case 'status': {
      log(`Agent     ${api.agent}`)
      log(`Registry  ${cfg.registry} on chain ${cfg.chainId}`)
      log(`Balance   ${formatEther(await api.balance())} BOT`)
      if (!registered) return log('Not registered yet.')
      await api.reconcile(store)
      const p = await api.profile()
      log(`Name      ${p.name}`)
      log(`Receipts  ${p.receiptCount} sealed, ${p.trueCount} true, ${p.falseCount} false`)
      log(`Head      ${p.head}`)
      for (const r of store.data.receipts.slice(-15)) {
        log(`  #${r.id ?? '?'}  ${r.status.padEnd(8)} ${r.status === 'revealed' ? (r.outcome ? 'TRUE ' : 'FALSE') : '     '}  ${r.claimText}`)
      }
      return
    }
    case 'register':
    case 'daybreak': {
      if (cmd === 'daybreak' && args[0] !== 'register') return daybreakCmd(cfg, api, store, registered)
      if (registered) return log(`${api.agent} is already registered as "${(await api.profile()).name}".`)
      const [name, uri = ''] = cmd === 'daybreak' ? [daybreak.NAME, daybreak.METADATA_URI] : args
      if (!name) throw new Error('Usage: register <name> [metadataURI]')
      log(`Registering ${api.agent} as "${name}"`)
      await api.register(name, uri)
      return log('Registered.')
    }
    case 'seal': {
      needRegistered()
      const [category, ...words] = args
      const claimText = words.join(' ').trim()
      if (!category || !claimText) throw new Error('Usage: seal <category> <claim text>')
      await api.reconcile(store)
      log(`Sealing: ${claimText}`)
      const e = await api.seal(store, { claimText, category })
      return log(`Sealed as #${e.id}. Reveal later with: node notary.mjs reveal ${e.id} true|false`)
    }
    case 'reveal': {
      needRegistered()
      const id = Number(args[0])
      const outcome = { true: true, false: false }[args[1]]
      if (!Number.isInteger(id) || outcome === undefined) throw new Error('Usage: reveal <id> <true|false>')
      await api.reconcile(store)
      const e = store.byId(id)
      if (!e) throw new Error(`Receipt #${id} is not in this store.`)
      if (e.status !== 'sealed') throw new Error(`Receipt #${id} is ${e.status}.`)
      log(`Revealing #${id} as ${outcome ? 'TRUE' : 'FALSE'}: ${e.claimText}`)
      await api.reveal(store, e, outcome)
      return log('Revealed.')
    }
    case 'show': {
      const e = store.byId(Number(args[0]))
      if (!e) throw new Error(`Receipt #${args[0]} is not in this store.`)
      return log(`#${e.id} ${e.status}\nClaim  ${e.claimText}\nNonce  ${e.nonce}\nHash   ${e.hash}`)
    }
    default:
      throw new Error(`Unknown command "${cmd}".\n\n${HELP}`)
  }
}

async function daybreakCmd(cfg, api, store, registered) {
  const sub = args[0]
  if (sub !== 'tick' && sub !== 'run') throw new Error('Usage: daybreak register | tick | run')
  if (!registered) throw new Error(`${api.agent} is not registered. Run: node notary.mjs daybreak register`)
  const once = async () => {
    const { waiting, nextSeal } = await daybreak.tick({ api, store, now: nowMs(cfg), log: (m) => log(`${stamp()}  ${m}`) })
    return `${waiting} sealed claim(s) waiting for their close; next seal from ${new Date(nextSeal).toISOString().slice(0, 16).replace('T', ' ')} UTC.`
  }
  if (sub === 'tick') return log(await once())

  log(`${stamp()}  Daybreak running as ${api.agent}. Ctrl+C to stop.`)
  let last = ''
  for (;;) {
    try {
      const summary = await once()
      if (summary !== last) log(`${stamp()}  ${summary}`)
      last = summary
      const bal = await api.balance()
      if (bal < 10n ** 16n) log(`${stamp()}  Low balance: ${formatEther(bal)} BOT. A day of Daybreak costs about 0.025 BOT.`)
    } catch (e) {
      last = ''
      log(`${stamp()}  Error, will retry next minute: ${e.shortMessage ?? e.message}`)
    }
    await new Promise((r) => setTimeout(r, 60_000))
  }
}

// One writer per store: two runners sealing at once would both build on the same chain head.
function lock(path) {
  mkdirSync(dirname(path), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx')
      writeSync(fd, String(process.pid))
      closeSync(fd)
      const release = () => rmSync(path, { force: true })
      process.once('exit', release)
      for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => { release(); process.exit(130) })
      return release
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      const pid = Number(readFileSync(path, 'utf8'))
      if (alive(pid)) throw new Error(`Another runner (pid ${pid}) is using this store. Stop it first.`)
      rmSync(path, { force: true }) // stale lock from a crashed run
    }
  }
  throw new Error(`Could not lock ${path}`)
}

function alive(pid) {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

main().catch((e) => {
  console.error(`Error: ${e.shortMessage ?? e.message}`)
  process.exit(1)
})
