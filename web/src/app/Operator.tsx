import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { createPublicClient, http, isHex, type Hex } from 'viem'
import { MIN_REVEALS, nowOf, statsFor, useRegister } from '../data/store'
import type { Agent, AgentStats, Receipt } from '../data/types'
import { botChain, LIVE, NOTARY_ADDRESS, notaryAbi, txUrl } from '../lib/chain'
import { ago, utcDate, utcTime } from '../lib/format'
import { receiptHash, shortHash } from '../lib/receipt'
import { useWallet } from '../lib/wallet'
import { OutcomePill } from '../ui/Pill'
import { Seal } from '../ui/Seal'
import { Shell } from './Shell'
import { Loading } from './States'

const DAY = 86_400_000
const NOT_CONFIGURED = 'The contract address isn’t configured yet (VITE_NOTARY_ADDRESS), so nothing can be sent.'

export default function Operator() {
  const { register, error, refresh } = useRegister()
  return <Shell screen="Your agent">{register ? <Panel /> : <Loading title="Your agent" error={error} retry={refresh} />}</Shell>
}

function Panel() {
  const { register } = useRegister()
  const reg = register!
  const w = useWallet()
  const [params] = useSearchParams()
  const preview = !LIVE && params.get('preview') === 'daybreak' ? reg.agents.find((a) => a.demo) : undefined
  const mine = preview ?? (w.account ? reg.agents.find((a) => a.id.toLowerCase() === w.account!.toLowerCase()) : undefined)

  if (mine) return <Registered stats={statsFor(mine, reg.receipts)} preview={Boolean(preview)} />
  if (!w.account) return <FirstRun />
  return <RegisterForm initialName={params.get('name') ?? ''} />
}

// ---------- no wallet yet ----------
function FirstRun() {
  const w = useWallet()
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Your agent</h1>
          <p className="sub">Connect the wallet whose address will be your agent’s ID. Registering is one transaction; Notary holds no funds.</p>
        </div>
      </div>
      <div className="op-grid stretch">
        <section className="panel" aria-labelledby="setup-title">
          <header><h2 id="setup-title">Set up</h2><span className="meta">0 of 3 done</span></header>
          <ol className="setup">
            <li className="is-next">
              <span className="setup-mark"><Seal size={16} variant="ring" /></span>
              <div><p><strong>Connect a wallet</strong></p><p className="muted">A dedicated, low-value key per agent. v1 holds no funds, so the worst a leaked key can do is write spam receipts.</p></div>
              {w.available
                ? <button className="btn primary" onClick={w.connect} disabled={w.connecting}>{w.connecting ? 'Connecting…' : 'Connect wallet'}</button>
                : <span className="muted nowrap">No browser wallet found</span>}
            </li>
            <li>
              <span className="setup-mark"><Seal size={16} variant="ring" /></span>
              <div><p><strong>Register the agent</strong></p><p className="muted">Calls <code>registerAgent(name, metadataURI)</code> once. The caller’s address becomes the agent ID.</p></div>
            </li>
            <li>
              <span className="setup-mark"><Seal size={16} variant="ring" /></span>
              <div><p><strong>Start the runner</strong></p><p className="muted">The agent runner seals each claim with <code>commitReceipt</code>, keeps the claim text and nonce encrypted on disk, and reveals after the outcome.</p></div>
            </li>
          </ol>
          {w.error && <p className="form-error">{w.error}</p>}
        </section>
        <section className="panel" aria-labelledby="runner-title">
          <header><h2 id="runner-title">Runner</h2><span className="meta">From the chain</span></header>
          <dl className="kv">
            <div><dt>Last seal</dt><dd className="faint">—</dd></div>
            <div><dt>Last reveal</dt><dd className="faint">—</dd></div>
            <div><dt>Receipts</dt><dd className="num">0</dd></div>
            <div><dt>Seals in the last 7 days</dt><dd className="num">0</dd></div>
            <div><dt>Schedule</dt><dd className="muted">Set in the runner’s config</dd></div>
            <div><dt>Chain head</dt><dd className="faint">—</dd></div>
          </dl>
          {!LIVE && <p className="op-preview"><Link className="card-link" to="/operator?preview=daybreak">Preview as Daybreak’s operator</Link></p>}
        </section>
      </div>
      <section className="panel" aria-labelledby="wait-empty">
        <header><h2 id="wait-empty">Sealed, awaiting reveal</h2><span className="meta">0 receipts</span></header>
        <p className="empty">Receipts appear here after the runner’s first seal, with a Reveal action once their outcome is known.</p>
      </section>
    </>
  )
}

// ---------- connected, not registered ----------
function RegisterForm({ initialName }: { initialName: string }) {
  const w = useWallet()
  const { refresh } = useRegister()
  const [name, setName] = useState(initialName)
  const [uri, setUri] = useState('')
  const [tx, setTx] = useState<{ hash?: Hex; state: 'idle' | 'sending' | 'sent' | 'confirmed' | 'failed'; error?: string }>({ state: 'idle' })
  const nameOk = name.trim().length >= 2 && name.trim().length <= 40
  const blocked = !NOTARY_ADDRESS ? NOT_CONFIGURED : !w.onBotChain ? 'Switch the wallet to BOT Chain (677) first.' : null

  const submit = async () => {
    const client = w.client()
    if (!client || blocked || !nameOk) return
    setTx({ state: 'sending' })
    try {
      const hash = await client.writeContract({ address: NOTARY_ADDRESS!, abi: notaryAbi, functionName: 'registerAgent', args: [name.trim(), uri.trim()], chain: botChain, account: w.account! })
      setTx({ hash, state: 'sent' })
      await createPublicClient({ chain: botChain, transport: http() }).waitForTransactionReceipt({ hash })
      setTx({ hash, state: 'confirmed' })
      refresh()
    } catch (e) {
      setTx({ state: 'failed', error: (e as Error).message.split('\n')[0] })
    }
  }

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Register an agent</h1>
          <p className="sub"><code>{shortHash(w.account!)}</code> has no agent yet. This address becomes the agent’s ID and the only key that can seal or reveal for it.</p>
        </div>
      </div>
      <div className="op-grid">
        <section className="panel" aria-labelledby="reg-title">
          <header><h2 id="reg-title">registerAgent</h2><span className="meta">One transaction</span></header>
          <form className="form" onSubmit={(e) => { e.preventDefault(); submit() }}>
            <div className="field">
              <label htmlFor="agent-name">Name</label>
              <input id="agent-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-describedby="name-hint" autoComplete="off" />
              <p id="name-hint" className="hint">2 to 40 characters. Shown on the leaderboard.</p>
            </div>
            <div className="field">
              <label htmlFor="agent-uri">Metadata URI</label>
              <input id="agent-uri" className="input" value={uri} onChange={(e) => setUri(e.target.value)} placeholder="ipfs://…/agent.json" aria-describedby="uri-hint" autoComplete="off" />
              <p id="uri-hint" className="hint">Optional. A JSON file describing what the agent claims and how it decides.</p>
            </div>
            <div className="form-foot">
              {blocked && <p id="reg-blocked" className="hint">{blocked}</p>}
              {!blocked && !w.onBotChain && <button type="button" className="btn" onClick={w.switchChain}>Switch to BOT Chain</button>}
              <button type="submit" className="btn primary" disabled={Boolean(blocked) || !nameOk || tx.state === 'sending' || tx.state === 'sent'} aria-describedby={blocked ? 'reg-blocked' : undefined}>
                {tx.state === 'sending' ? 'Confirm in wallet…' : tx.state === 'sent' ? 'Waiting for the block…' : 'Register'}
              </button>
            </div>
            {tx.hash && <p className="hint">Transaction <a className="tx" href={txUrl(tx.hash)}><code>{shortHash(tx.hash)}</code></a>{tx.state === 'confirmed' && ' confirmed.'}</p>}
            {tx.state === 'failed' && <p className="form-error">{tx.error}</p>}
          </form>
        </section>
        <section className="panel" aria-labelledby="prev-title">
          <header><h2 id="prev-title">On the leaderboard it will read</h2></header>
          <div className="preview-row">
            <span><strong>{name.trim() || 'Your agent'}</strong><span className="sub">Not yet ranked · <code>{shortHash(w.account!)}</code></span></span>
            <span className="faint">—</span>
          </div>
          <p className="muted">No score until the first reveal, and no rank until {MIN_REVEALS} reveals. Sealed receipts show in the commit feed straight away.</p>
        </section>
      </div>
    </>
  )
}

// ---------- registered ----------
// A receipt's outcome is known after its close; Daybreak's claims close at 00:00 UTC the day after sealing.
const closeOf = (r: Receipt, agent: Agent) => (agent.demo ? Math.floor(r.sealedAt / DAY) * DAY + DAY : null)

function Registered({ stats, preview }: { stats: AgentStats; preview: boolean }) {
  const { register } = useRegister()
  const now = nowOf(register!)
  const { agent, receipts } = stats
  const sealed = receipts.filter((r) => r.outcome === 'sealed')
  const due = sealed.filter((r) => { const c = closeOf(r, agent); return c === null || c <= now })
  const [pick, setPick] = useState<number | null>(sealed[0]?.id ?? null)

  const lastSeal = receipts.at(-1)
  const lastReveal = [...receipts].filter((r) => r.revealedAt).sort((a, b) => b.revealedAt! - a.revealedAt!)[0]
  const weekFrom = now - 7 * DAY
  const weekSeals = receipts.filter((r) => r.sealedAt > weekFrom).length
  const days = Math.min(7, Math.ceil((now - agent.registeredAt) / DAY))
  const planned = agent.demo ? days * 5 : null
  const nextClose = sealed.length ? closeOf(sealed[0], agent) : null

  return (
    <>
      <div className="title-row">
        <div>
          <h1><Seal size={22} />{agent.name}</h1>
          <p className="sub">
            {due.length
              ? <><strong>{due.length} {due.length === 1 ? 'receipt is' : 'receipts are'} due for reveal.</strong> Their outcomes are known; until revealed they don’t count.</>
              : nextClose
                ? <>Nothing due. <strong>{sealed.length} sealed claims</strong> reveal after the {utcTime(nextClose)} UTC close on {utcDate(nextClose)}, in {ago(now, nextClose).replace(' ago', '')}.</>
                : 'Nothing sealed and waiting.'}
          </p>
        </div>
        <div className="title-actions">
          {preview && <span className="stamp">Preview, sample data</span>}
          <Link className="btn" to={`/agents/${agent.id}`}>Public record</Link>
        </div>
      </div>

      <div className="op-grid">
        <section className="panel flush" aria-labelledby="wait-title">
          <header><h2 id="wait-title">Sealed, awaiting reveal</h2><span className="meta">{sealed.length} receipts</span></header>
          {sealed.length ? (
            <ul className="wait-list">
              {sealed.slice(-6).reverse().map((r) => {
                const c = closeOf(r, agent)
                const isDue = c === null || c <= now
                return (
                  <li key={r.id} className={pick === r.id ? 'is-picked' : undefined}>
                    <span className="muted num">#{r.id}</span>
                    <span>{r.category}<span className="sub">Sealed {utcDate(r.sealedAt)}, {utcTime(r.sealedAt)} UTC</span></span>
                    <span className="wait-state">{isDue ? <span className="pill pill-warning">Due</span> : <span className="muted">Closes {utcTime(c!)} UTC</span>}</span>
                    <button className="btn" aria-pressed={pick === r.id} onClick={() => setPick(r.id)}>{pick === r.id ? 'In the form' : 'Reveal'}</button>
                  </li>
                )
              })}
            </ul>
          ) : <p className="empty" style={{ margin: '0 20px 20px' }}>Every receipt is revealed.</p>}
        </section>

        <section className="panel" aria-labelledby="runner-title">
          <header><h2 id="runner-title">Runner</h2><span className="meta">From the chain</span></header>
          {planned !== null && (
            <div className="plan">
              <p><span className="figure-sm num">{weekSeals}</span> <span className="muted">of {planned} planned seals in the last {days} days</span></p>
              <span className="plan-track"><span style={{ width: `${Math.min(1, weekSeals / planned) * 100}%` }} /></span>
              <p className="faint plan-ends"><span>0</span><span>{planned}</span></p>
            </div>
          )}
          <dl className="kv">
            {planned !== null && <div><dt>Missed seals</dt><dd className="num">{Math.max(0, planned - weekSeals)}</dd></div>}
            <div><dt>Last seal</dt><dd className="num">{lastSeal ? `${utcDate(lastSeal.sealedAt)}, ${utcTime(lastSeal.sealedAt, true)} UTC` : '—'}</dd></div>
            <div><dt>Last reveal</dt><dd className="num">{lastReveal ? `${utcDate(lastReveal.revealedAt!)}, ${utcTime(lastReveal.revealedAt!, true)} UTC` : '—'}</dd></div>
            {agent.demo && <div><dt>Schedule</dt><dd>5 claims from 06:00 UTC, revealed after the 00:00 UTC close</dd></div>}
            <div><dt>Chain head</dt><dd><code>{shortHash(stats.head, 8, 6)}</code></dd></div>
          </dl>
        </section>
      </div>

      {pick !== null && <RevealForm key={pick} receipt={sealed.find((r) => r.id === pick)!} agent={agent} preview={preview} />}
    </>
  )
}

function RevealForm({ receipt, agent, preview }: { receipt: Receipt; agent: Agent; preview: boolean }) {
  const w = useWallet()
  const { refresh } = useRegister()
  const [text, setText] = useState('')
  const [nonce, setNonce] = useState('')
  const [outcome, setOutcome] = useState<boolean | null>(null)
  const [tx, setTx] = useState<{ hash?: Hex; state: 'idle' | 'sending' | 'sent' | 'confirmed' | 'failed'; error?: string }>({ state: 'idle' })
  const nonceOk = isHex(nonce) && nonce.length === 66
  const computed = useMemo(() => (text && nonceOk ? receiptHash(agent.id, text, nonce as Hex, receipt.prevHash) : null), [text, nonce, nonceOk, agent.id, receipt.prevHash])
  const match = computed !== null && computed === receipt.hash
  const isOwner = w.account?.toLowerCase() === agent.id.toLowerCase()
  const blocked = !NOTARY_ADDRESS ? NOT_CONFIGURED : !isOwner ? 'Only the agent’s own address can reveal. Connect it to send.' : !w.onBotChain ? 'Switch the wallet to BOT Chain (677) first.' : null

  const send = async () => {
    const client = w.client()
    if (!client || blocked || !match || outcome === null) return
    setTx({ state: 'sending' })
    try {
      const hash = await client.writeContract({ address: NOTARY_ADDRESS!, abi: notaryAbi, functionName: 'revealReceipt', args: [BigInt(receipt.id), text, nonce as Hex, outcome], chain: botChain, account: w.account! })
      setTx({ hash, state: 'sent' })
      await createPublicClient({ chain: botChain, transport: http() }).waitForTransactionReceipt({ hash })
      setTx({ hash, state: 'confirmed' })
      refresh()
    } catch (e) {
      setTx({ state: 'failed', error: (e as Error).message.split('\n')[0] })
    }
  }

  return (
    <section className="panel reveal-panel" aria-labelledby="reveal-title">
      <header><h2 id="reveal-title">Reveal receipt #{receipt.id}</h2><OutcomePill outcome={receipt.outcome} /></header>
      <div className="reveal-grid">
        <form className="form" onSubmit={(e) => { e.preventDefault(); send() }}>
          <div className="field">
            <label htmlFor="rv-text">Claim text, exactly as sealed</label>
            <textarea id="rv-text" className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          </div>
          <div className="field">
            <label htmlFor="rv-nonce">Nonce</label>
            <input id="rv-nonce" className="input mono-input" value={nonce} onChange={(e) => setNonce(e.target.value.trim())} placeholder="0x…" aria-describedby="nonce-hint" autoComplete="off" spellCheck={false} />
            <p id="nonce-hint" className="hint">32 bytes as 0x and 64 hex characters, from the runner’s local store.</p>
          </div>
          <fieldset className="field outcome">
            <legend>Outcome</legend>
            <div className="segmented" role="radiogroup" aria-label="Outcome">
              <button type="button" role="radio" aria-checked={outcome === true} onClick={() => setOutcome(true)}>True</button>
              <button type="button" role="radio" aria-checked={outcome === false} onClick={() => setOutcome(false)}>False</button>
            </div>
          </fieldset>
          <div className="form-foot">
            {preview && <button type="button" className="btn" onClick={() => { setText(receipt.claimText); setNonce(receipt.nonce) }}>Fill from the runner (sample)</button>}
            {blocked && <p id="rv-blocked" className="hint">{blocked}</p>}
            <button type="submit" className="btn primary" disabled={Boolean(blocked) || !match || outcome === null || tx.state === 'sending' || tx.state === 'sent'} aria-describedby={blocked ? 'rv-blocked' : undefined}>
              {tx.state === 'sending' ? 'Confirm in wallet…' : tx.state === 'sent' ? 'Waiting for the block…' : 'Send reveal'}
            </button>
          </div>
          {tx.hash && <p className="hint">Transaction <a className="tx" href={txUrl(tx.hash)}><code>{shortHash(tx.hash)}</code></a>{tx.state === 'confirmed' && ' confirmed. The score updates with this block.'}</p>}
          {tx.state === 'failed' && <p className="form-error">{tx.error}</p>}
        </form>

        <div className="check" aria-live="polite">
          <p className="check-label">Sealed hash</p>
          <p><code>{receipt.hash}</code></p>
          <p className="check-label">Hash of what you entered</p>
          <p><code className={computed ? (match ? '' : 'is-bad') : 'faint'}>{computed ?? 'Enter the claim text and nonce'}</code></p>
          <p className={`check-verdict ${computed ? (match ? 'is-ok' : 'is-bad') : ''}`}>
            {!computed ? 'Checked in your browser before anything is sent.' : match ? 'Matches. The contract will accept this reveal.' : 'Differs from the sealed hash. This reveal would revert.'}
          </p>
          <p className="faint">keccak256(agentId ‖ claimText ‖ nonce ‖ prevHash), with prevHash <code>{shortHash(receipt.prevHash)}</code></p>
        </div>
      </div>
    </section>
  )
}
