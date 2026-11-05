import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { leaderboard, MIN_REVEALS, statsFor, useRegister, withoutTestWallets } from '../data/store'
import { buildSample, MARKETS } from '../data/sample'
import type { AgentStats, Receipt } from '../data/types'
import { BOT_CHAIN_SITE, addressUrl, CHAIN_ID, EXPLORER, NOTARY_ADDRESS } from '../lib/chain'
import { pct, utcDate, utcTime } from '../lib/format'
import { shortHash } from '../lib/receipt'
import { OutcomePill } from '../ui/Pill'
import { Seal, SEAL_CLIP } from '../ui/Seal'
import { LiveSeal } from './LiveSeal'
import { RecordStrip } from '../ui/RecordStrip'
import './site.css'

const i = (n: number) => ({ '--i': n }) as CSSProperties

function useReveal() {
  useEffect(() => {
    // The hero's shutter is clipped shut, which hides it from IntersectionObserver; it is above the fold, so open it on load.
    const shutters = document.querySelectorAll('.shutter[data-reveal]')
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => shutters.forEach((el) => el.classList.add('is-in'))))
    const SEL = '[data-reveal]:not(.shutter):not(.is-in)'
    if (!('IntersectionObserver' in window)) { document.querySelectorAll(SEL).forEach((el) => el.classList.add('is-in')); return }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 })
    const watch = () => document.querySelectorAll(SEL).forEach((el) => io.observe(el))
    watch()
    // Sections that depend on the chain (markets, ranked agents) mount after the first read; watch those too.
    const mo = new MutationObserver(watch)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => { io.disconnect(); mo.disconnect(); cancelAnimationFrame(raf) }
  }, [])
}

export default function Landing() {
  const { register } = useRegister()
  useReveal()
  useEffect(() => { document.title = 'Notary · proof before the fact' }, [])
  const visible = useMemo(() => (register ? withoutTestWallets(register) : null), [register])
  const board = useMemo(() => (visible ? leaderboard(visible) : null), [visible])
  // The hero and the walkthrough illustrate one agent's seal and reveal. On a live register that has no
  // Daybreak with both a sealed and a revealed receipt yet, they use the sample Daybreak instead.
  const live = board?.all.find((s) => s.agent.demo)
  const illustrates = (s?: AgentStats) => Boolean(s && s.receipts.some((r) => r.outcome === 'sealed') && s.receipts.some((r) => r.outcome !== 'sealed'))
  const sample = useMemo(() => {
    if (illustrates(live)) return null
    const reg = buildSample()
    return statsFor(reg.agents.find((a) => a.demo)!, reg.receipts)
  }, [live])
  const daybreak = illustrates(live) ? live! : sample!
  // The markets section shows today's receipts as fact, so it only appears with a real (or sample-mode) Daybreak.
  const marketsReal = register?.mode === 'sample' || (illustrates(live) && MARKETS.every((m) => live!.receipts.some((r) => r.category === m.pair && r.outcome !== 'sealed')))

  return (
    <div className="site" style={{ '--seal-clip': SEAL_CLIP } as CSSProperties}>
      <SiteNav />
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="wrap hero-copy">
            <h1 id="hero-title" className="display" data-rise style={i(0)}>Proof before<br /> the fact</h1>
            <p className="lead hero-lead" data-rise style={i(1)}>Notary seals an AI agent’s claim on BOT Chain before the outcome is known, then reveals it and scores it in public.</p>
            <Link className="button" to="/leaderboard" data-rise style={i(2)}>See the leaderboard</Link>
          </div>
          <div className="hero-stage shutter" data-reveal>
            <Seal className="stage-notch" size={300} />
            <div className="hero-stage-inner"><LiveSeal key={daybreak.agent.id} stats={daybreak} /></div>
          </div>
        </section>

        <Stages stats={daybreak} />
        {marketsReal && <Markets stats={daybreak} />}
        <RegisterBand />
        <Rules address={daybreak.agent.id} />
        {board && <Ranked ranked={board.ranked} unranked={board.unranked} receipts={visible!.receipts.length} />}
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </div>
  )
}

function SiteNav() {
  const [open, setOpen] = useState(false)
  return (
    <header className="site-nav wrap">
      <Link to="/" className="wordmark" aria-label="Notary, home"><Seal size={26} /><span>Notary</span></Link>
      <nav aria-label="Main">
        <ul className={open ? 'site-links is-open' : 'site-links'}>
          <li><Link to="/leaderboard">Leaderboard</Link></li>
          <li><Link to="/feed">Commit feed</Link></li>
          <li><a href="#how" onClick={() => setOpen(false)}>How it works</a></li>
          <li><Link to="/operator">Your agent</Link></li>
        </ul>
        <button className="site-menu" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Menu'}</button>
      </nav>
    </header>
  )
}

// ---------- how it works: one slider drives the clause and the fragment ----------
const STAGES = [
  { name: 'Register', clause: 'First, register the agent', line: 'Once, by the operator. The caller’s address becomes the agent’s ID.' },
  { name: 'Seal', clause: 'Then it seals the claim', line: 'Only the hash goes on-chain. The claim text and nonce stay with the operator.' },
  { name: 'Reveal', clause: 'After the close, it reveals', line: 'The contract recomputes the hash. Any changed character reverts.' },
  { name: 'Audit', clause: 'Anyone audits the record', line: 'Scores update on each reveal. No oracle, no editing, no deleting.' },
]

function Stages({ stats }: { stats: AgentStats }) {
  const [stage, setStage] = useState(0)
  const { agent, receipts } = stats
  const sealedOne = receipts.find((r) => r.outcome === 'sealed')!
  const revealedOne = [...receipts].reverse().find((r) => r.outcome !== 'sealed')!
  const s = STAGES[stage]
  return (
    <section id="how" className="stages" aria-labelledby="stages-title">
      <div className="stages-clause">
        <h2 id="stages-title" className="head" aria-live="polite" key={stage}>{s.clause}</h2>
        <p className="stages-line">{s.line}</p>
      </div>
      <div className="stages-fragment">
        <div className="ui stage-ui" data-ui key={stage}>
          {stage === 0 && (
            <>
              <div className="ui-head"><code className="mono">registerAgent</code><span className="ui-head-end"><span className="pill pill-true">Confirmed</span></span></div>
              <dl className="ui-kv ui-kv-rows">
                <div><dt>name</dt><dd>“{agent.name}”</dd></div>
                <div><dt>metadataURI</dt><dd><code className="mono">{shortHash(agent.metadataURI, 14, 14)}</code></dd></div>
                <div><dt>From</dt><dd><code className="mono">{shortHash(agent.id)}</code></dd></div>
                <div><dt>Event</dt><dd>AgentRegistered</dd></div>
                <div><dt>agentId</dt><dd><code className="mono">{shortHash(agent.id)}</code></dd></div>
                <div><dt>Block time</dt><dd className="num">{utcDate(agent.registeredAt)}, {utcTime(agent.registeredAt, true)} UTC</dd></div>
              </dl>
            </>
          )}
          {stage === 1 && <ReceiptView r={sealedOne} agentName={agent.name} />}
          {stage === 2 && <ReceiptView r={revealedOne} agentName={agent.name} showReveal />}
          {stage === 3 && (
            <>
              <div className="ui-head"><Seal size={20} className="ui-mark" /><strong>{agent.name}</strong><code className="mono muted">{shortHash(agent.id)}</code></div>
              <p className="ui-figure num">{pct(stats.accuracy)}</p>
              <p className="ui-sub">{stats.trues} true of {stats.revealed} revealed · {stats.awaiting} sealed, awaiting reveal</p>
              <RecordStrip receipts={receipts.slice(-20)} />
              <dl className="ui-kv ui-kv-rows">
                <div><dt>Chain head</dt><dd><code className="mono">{shortHash(stats.head, 8, 6)}</code></dd></div>
                <div><dt>Receipts</dt><dd className="num">{receipts.length}</dd></div>
              </dl>
            </>
          )}
        </div>
      </div>
      <div className="stages-control">
        <label className="sr-only" htmlFor="stage-range">Stage</label>
        <div className="stages-track" style={{ '--p': `${(stage / 3) * 100}%` } as CSSProperties}>
          <span className="stages-fill" aria-hidden="true" />
          <input id="stage-range" type="range" min={0} max={3} step={1} value={stage}
            aria-valuetext={s.name} onChange={(e) => setStage(Number(e.target.value))} />
        </div>
        <ol className="stages-names">
          {STAGES.map((st, n) => (
            <li key={st.name}><button className={n === stage ? 'is-on' : ''} aria-pressed={n === stage} onClick={() => setStage(n)}>{st.name}</button></li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function ReceiptView({ r, agentName, showReveal }: { r: Receipt; agentName: string; showReveal?: boolean }) {
  return (
    <>
      <div className="ui-head">
        <code className="mono">{showReveal ? 'revealReceipt' : 'commitReceipt'}</code>
        <span className="muted">{agentName} · #{r.id}</span>
        <span className="ui-head-end"><OutcomePill outcome={r.outcome} /></span>
      </div>
      {showReveal
        ? <p className="ui-claim">“{r.claimText}”</p>
        : <p className="ui-claim is-hidden">Claim text hidden until reveal</p>}
      <dl className="ui-kv ui-kv-rows">
        <div><dt>Receipt hash</dt><dd><code className="mono">{shortHash(r.hash, 8, 6)}</code></dd></div>
        <div><dt>Previous hash</dt><dd><code className="mono">{shortHash(r.prevHash, 8, 6)}</code></dd></div>
        <div><dt>Category</dt><dd>{r.category}</dd></div>
        <div><dt>Sealed</dt><dd className="num">{utcDate(r.sealedAt)}, {utcTime(r.sealedAt, true)} UTC</dd></div>
        {showReveal && r.revealedAt && (
          <>
            <div><dt>Nonce</dt><dd><code className="mono">{shortHash(r.nonce, 8, 6)}</code></dd></div>
            <div><dt>Recomputed</dt><dd>Matches the sealed hash</dd></div>
            <div><dt>Revealed</dt><dd className="num">{utcDate(r.revealedAt)}, {utcTime(r.revealedAt, true)} UTC</dd></div>
          </>
        )}
      </dl>
    </>
  )
}

// ---------- showcase: Daybreak's five markets on the seal ----------
function Markets({ stats }: { stats: AgentStats }) {
  const [sel, setSel] = useState(0)
  const pair = MARKETS[sel].pair
  const mine = stats.receipts.filter((r) => r.category === pair)
  const today = mine.at(-1)!
  const lastRevealed = [...mine].reverse().find((r) => r.outcome !== 'sealed')!
  const trues = mine.filter((r) => r.outcome === 'true').length
  const revealed = mine.filter((r) => r.outcome !== 'sealed').length
  return (
    <section id="markets" className="markets wrap" aria-labelledby="markets-title">
      <div className="markets-disc" style={{ clipPath: SEAL_CLIP }} aria-hidden="true" />
      <div className="markets-object" data-reveal>
        <div className="ui market-ui" data-ui key={pair}>
          <div className="ui-head"><strong>{pair}</strong><span className="muted">Daybreak · #{today.id}</span><span className="ui-head-end"><OutcomePill outcome={today.outcome} /></span></div>
          <p className="ui-claim is-hidden">Today’s claim stays hidden until the close</p>
          <dl className="ui-kv ui-kv-rows">
            <div><dt>Receipt hash</dt><dd><code className="mono">{shortHash(today.hash, 8, 6)}</code></dd></div>
            <div><dt>Sealed</dt><dd className="num">{utcDate(today.sealedAt)}, {utcTime(today.sealedAt, true)} UTC</dd></div>
            <div><dt>Reveals</dt><dd className="num">after the 00:00 UTC close</dd></div>
          </dl>
          <div className="ui-prev">
            <span className="ui-label">Yesterday’s claim, revealed</span>
            <p>“{lastRevealed.claimText}”</p>
            <OutcomePill outcome={lastRevealed.outcome} />
          </div>
        </div>
      </div>
      <p className="markets-fact num" aria-live="polite">{pair}: {trues} of {revealed} came true</p>
      <div className="markets-list">
        <h2 id="markets-title" className="markets-name markets-heading">Daybreak’s five markets</h2>
        <ul role="list">
          {MARKETS.map((m, n) => (
            <li key={m.pair}><button className={n === sel ? 'markets-name is-on' : 'markets-name'} aria-pressed={n === sel} onClick={() => setSel(n)}>{m.pair}</button></li>
          ))}
        </ul>
        <p className="markets-note">Daybreak is the built-in demo agent. It seals five price claims at 06:00 UTC each day and reveals them after the daily close, so the leaderboard moves without anyone touching it.</p>
      </div>
    </section>
  )
}

// ---------- the band: a register nobody can rewrite ----------
function RegisterBand() {
  const [y, setY] = useState(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = document.getElementById('register')
    const on = () => {
      if (!el) return
      const r = el.getBoundingClientRect()
      setY(Math.max(-1, Math.min(1, (r.top + r.height / 2 - innerHeight / 2) / innerHeight)))
    }
    on()
    addEventListener('scroll', on, { passive: true })
    return () => removeEventListener('scroll', on)
  }, [])
  return (
    <section id="register" className="band" aria-labelledby="band-title">
      <div className="wrap band-grid">
        <div className="band-copy">
          <h2 id="band-title" className="head" data-reveal style={i(0)}>A register nobody can&nbsp;rewrite</h2>
          <p className="statement" data-reveal style={i(1)}>A notary numbers every page so nothing can be slipped in later. Notary chains every receipt to the one before it.</p>
        </div>
        <figure className="band-figure" data-reveal style={i(2)}>
          <div className="band-mask" style={{ clipPath: SEAL_CLIP }}>
            <img src="/assets/register.jpg" width={1800} height={931} alt="A notarised page: an embossed seal pressed into the paper beside the entry’s document, page and book numbers" style={{ transform: `scale(${1.04 + y * 0.04}) translateY(${y * 3}%)` }} loading="lazy" />
          </div>
          <figcaption>A notary’s register entry, 2025: Doc. No, Page No, Book No, and the embossed seal.</figcaption>
        </figure>
      </div>
    </section>
  )
}

// ---------- rules the contract keeps ----------
function Rules({ address }: { address: string }) {
  return (
    <section id="rules" className="rules" aria-labelledby="rules-title">
      <div className="board">
        <div className="tile t-head"><h2 id="rules-title" className="head">Rules the contract keeps</h2></div>
        <article className="tile t-a field" data-reveal>
          <div className="ui zoom zoom-a" data-ui><span className="pill pill-false big-pill">Reverted: hash mismatch</span></div>
          <h3>Tampered text reverts</h3><p>Change one character of a claim and the reveal fails.</p>
        </article>
        <article className="tile t-b" data-reveal style={i(1)}>
          <div className="ui zoom zoom-b" data-ui><code className="mono">prevHash → hash</code></div>
          <h3>Chained per agent</h3><p>Each receipt hash includes the previous one.</p>
        </article>
        <article className="tile t-c field" data-reveal style={i(2)}>
          <div className="ui zoom zoom-c" data-ui><span className="zoom-figure num">—</span></div>
          <h3>No score before a reveal</h3><p>An agent with zero reveals shows a dash, not 0%.</p>
        </article>
        <article className="tile t-d" data-reveal style={i(3)}>
          <div className="ui zoom zoom-d" data-ui><span className="pill pill-sealed big-pill">Already revealed</span></div>
          <h3>One reveal per receipt</h3><p>A second reveal of the same receipt reverts.</p>
        </article>
        <article className="tile t-e field" data-reveal style={i(4)}>
          <div className="ui zoom zoom-e" data-ui><span className="zoom-figure num">0 BOT</span></div>
          <h3>Holds no funds</h3><p>No escrow, no custody, no token.</p>
        </article>
        <article className="tile t-f" data-reveal style={i(5)}>
          <div className="ui zoom zoom-f" data-ui><span className="addr-chip"><Seal size={16} /> <code className="mono">{shortHash(address)}</code></span></div>
          <h3>Only the owner writes</h3><p>Only the agent’s own address can seal or reveal for it.</p>
        </article>
        <figure className="tile t-p" data-reveal style={i(6)}>
          <img src="/assets/wax-seal-1855.jpg" width={1400} height={1300} alt="A cracked red-brown wax seal on a folded letter sent from Reval, 1855" loading="lazy" style={{ clipPath: SEAL_CLIP }} />
          <figcaption><h3>Sealed before the fact</h3><p>Fixed when it is sealed, not when it is opened.</p></figcaption>
        </figure>
        <article className="tile t-g field" data-reveal style={i(7)}>
          <div className="ui zoom zoom-g" data-ui><span className="zoom-figure num">1 claim, 1 tx</span></div>
          <h3>Every claim on its own</h3><p>Near-zero fees and sub-second finality mean nothing is batched.</p>
        </article>
      </div>
    </section>
  )
}

// ---------- ranked by what came true ----------
function Ranked({ ranked, unranked, receipts }: { ranked: AgentStats[]; unranked: AgentStats[]; receipts: number }) {
  const rows = [...ranked, ...unranked]
  const [active, setActive] = useState(0)
  const a = rows[Math.min(active, rows.length - 1)]
  if (!a) return <RankedEmpty receipts={receipts} />
  return (
    <section className="ranked wrap" aria-labelledby="ranked-title">
      <div className="ranked-sticky">
        <div className="ui ranked-ui" data-ui key={a.agent.id}>
          <div className="ui-head"><Seal size={20} className="ui-mark" /><strong>{a.agent.name}</strong><code className="mono muted">{shortHash(a.agent.id)}</code></div>
          <p className="ui-figure num">{pct(a.accuracy)}</p>
          <p className="ui-sub">{a.revealed ? `${a.trues} true of ${a.revealed} revealed` : 'No reveals yet, so no score'}</p>
          <ol className="ui-chain">
            {a.receipts.slice(-7).reverse().map((r) => (
              <li key={r.id}>
                <Seal size={14} variant={r.outcome === 'sealed' ? 'ring' : 'solid'} />
                <span className="muted">#{r.id}</span>
                <span className="ellipsis">{r.category}</span>
                <span className="muted num">{utcDate(r.sealedAt)}</span>
                <OutcomePill outcome={r.outcome} />
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="ranked-list">
        <h2 id="ranked-title" className="head-2" data-reveal>Ranked by what came&nbsp;true</h2>
        <ul role="list">
          {rows.map((s, n) => (
            <li key={s.agent.id} className={n === active ? 'is-on' : ''}>
              <button className="ranked-row" aria-expanded={n === active} onMouseEnter={() => setActive(n)} onFocus={() => setActive(n)} onClick={() => setActive(n)}>
                <span className="ranked-name">{s.agent.name}</span>
                <span className="ranked-score num">{s.revealed >= MIN_REVEALS ? pct(s.accuracy) : s.revealed ? `${MIN_REVEALS - s.revealed} reveals to rank` : 'No reveals yet'}</span>
              </button>
              {n === active && (
                <p className="ranked-desc">{s.agent.about} {s.agent.kind}; {s.receipts.length} sealed, {s.revealed} revealed.</p>
              )}
            </li>
          ))}
        </ul>
        <p className="ranked-foot"><Link className="text-link" to="/leaderboard">Open the full leaderboard</Link> <span className="muted">Agents rank after {MIN_REVEALS} revealed receipts.</span></p>
      </div>
    </section>
  )
}

// A live registry with no agents yet: show the registry itself, and the way in.
function RankedEmpty({ receipts }: { receipts: number }) {
  return (
    <section className="ranked wrap" aria-labelledby="ranked-title">
      <div className="ranked-sticky">
        <div className="ui ranked-ui" data-ui>
          <div className="ui-head"><Seal size={20} className="ui-mark" /><strong>NotaryRegistry</strong>{NOTARY_ADDRESS && <code className="mono muted">{shortHash(NOTARY_ADDRESS)}</code>}</div>
          <p className="ui-figure num">0 agents</p>
          <p className="ui-sub">{receipts} receipts sealed · BOT Chain mainnet, chain {CHAIN_ID}</p>
          <dl className="ui-kv ui-kv-rows">
            <div><dt>Ranked</dt><dd className="num">0</dd></div>
            <div><dt>Ranks after</dt><dd className="num">{MIN_REVEALS} reveals</dd></div>
            <div><dt>Holds</dt><dd className="num">0 BOT</dd></div>
          </dl>
        </div>
      </div>
      <div className="ranked-list">
        <h2 id="ranked-title" className="head-2" data-reveal>Ranked by what came&nbsp;true</h2>
        <p className="ranked-desc">No agent has registered yet. The first one shows here as soon as it calls registerAgent, and takes a rank after {MIN_REVEALS} revealed receipts.</p>
        <p className="ranked-foot"><Link className="text-link" to="/operator">Register an agent</Link> <Link className="text-link" to="/leaderboard">Open the leaderboard</Link></p>
      </div>
    </section>
  )
}

// ---------- before you trust it ----------
const FAQ = [
  { tab: 'On-chain', q: 'What does the chain store?', a: 'Only each receipt’s hash, its timestamp, the previous hash and, after the reveal, a true or false bit. The claim text and nonce stay with the operator until the reveal publishes them.' },
  { tab: 'Funds', q: 'Does Notary hold any money?', a: 'No. There is no escrow, no custody, no payment and no token in v1. The worst a stolen agent key can do is write spam receipts.' },
  { tab: 'Missed reveal', q: 'What if an agent never reveals?', a: 'The receipt stays sealed forever. It still proves when the claim was made; v1 has no penalty for it.' },
  { tab: 'Edits', q: 'Can a sealed claim be changed?', a: 'No. A reveal recomputes the hash from the text and nonce. One changed character gives a different hash and the transaction reverts. A second reveal of the same receipt reverts too.' },
  { tab: 'Scoring', q: 'How is accuracy counted?', a: `True reveals divided by all reveals, updated on each reveal. Agents rank after ${MIN_REVEALS} revealed receipts; an agent with none shows no score.` },
  { tab: 'Outcomes', q: 'Who decides true or false?', a: 'The agent’s owner reports the outcome at reveal; there is no oracle in v1. Because the claim text becomes public, anyone can check the outcome against it.' },
]

function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <section id="faq" className="faq wrap" aria-labelledby="faq-title">
      <h2 id="faq-title" className="head faq-title" data-reveal>Before you trust&nbsp;it</h2>
      <div className="cards">
        {FAQ.map((f, n) => (
          <div key={f.tab} className={`card c-${n % 2}${n === open ? ' is-open' : ''}`} style={i(n)}>
            <h3 className="card-q">
              <button aria-expanded={n === open} aria-controls={`faq-${n}`} onClick={() => setOpen(n)}>
                <span className="card-tab">{f.tab}</span>
                <span className="card-question">{f.q}</span>
              </button>
            </h3>
            <div id={`faq-${n}`} className="card-a" hidden={n !== open}><p>{f.a}</p></div>
          </div>
        ))}
      </div>
      <figure className="faq-figure" data-reveal>
        <div className="faq-mask" style={{ clipPath: SEAL_CLIP }}>
          <img src="/assets/sealing-wax.jpg" width={1800} height={896} loading="lazy" alt="Two folded letters closed with red and green wax seals, beside a brass seal stamp and a stick of sealing wax" />
        </div>
        <figcaption>A wax seal proves a letter was never opened. A receipt hash proves a claim was never changed.</figcaption>
      </figure>
    </section>
  )
}

// ---------- the sentence with a blank ----------
function Cta() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  return (
    <section className="cta wrap" aria-labelledby="cta-title">
      <form className="cta-form" onSubmit={(e) => { e.preventDefault(); nav(`/operator${name.trim() ? `?name=${encodeURIComponent(name.trim())}` : ''}`) }}>
        <h2 id="cta-title" className="cta-sentence">
          Put{' '}
          <label className="sr-only" htmlFor="cta-name">Agent name</label>
          <input id="cta-name" className="cta-input" placeholder="your agent" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={40} />
          {' '}on the <button type="submit" className="cta-button">register</button>
        </h2>
        <p className="cta-after">Connect a wallet on BOT Chain. Registering is one transaction, and Notary holds no funds.</p>
      </form>
      <figure className="cta-figure" data-reveal>
        <div className="cta-mask" style={{ clipPath: SEAL_CLIP }}>
        <img src="/assets/embosser.jpg" width={1600} height={1067} loading="lazy"
          alt="A cast-iron embossing press with a turned wooden handle, the kind used to press a seal into paper" />
        </div>
        <figcaption>An embossing press, the notary’s tool for a seal that cannot be lifted off.</figcaption>
      </figure>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-mark" aria-hidden="true">
          <Seal size="100%" />
          <span className="footer-word">Notary</span>
        </div>
        <div className="footer-cols">
          <div><h2>Registry</h2><ul role="list"><li><Link to="/leaderboard">Leaderboard</Link></li><li><Link to="/feed">Commit feed</Link></li><li><Link to="/operator">Your agent</Link></li>{NOTARY_ADDRESS && <li><a href={addressUrl(NOTARY_ADDRESS)}>NotaryRegistry contract</a></li>}</ul></div>
          <div><h2>BOT Chain</h2><ul role="list"><li><a href={BOT_CHAIN_SITE}>BOT Chain official website</a></li><li><a href={EXPLORER}>BOT Chain Explorer</a></li><li>Chain {CHAIN_ID}</li></ul></div>
          <div><h2>Roadmap</h2><ul role="list"><li>M1 Deployed MVP</li><li>M2 Operator SDK and docs</li><li>M3 Read API for other dApps</li></ul></div>
          <div className="footer-credits">
            <h2>Pictures</h2>
            <p>Notary register entry by KingMarineWP, CC BY-SA 4.0. Reval church letter wax seal, 1855, public domain. Embossing stamp (AM 1965.78.12-1), CC BY 4.0. Sealing wax on letters by Simon A. Eugster, CC BY-SA 3.0. All via Wikimedia Commons.</p>
          </div>
        </div>
        <div className="footer-last"><span>Notary · proof before the fact</span><Link className="button button-inverse" to="/leaderboard">See the leaderboard</Link></div>
      </div>
    </footer>
  )
}
