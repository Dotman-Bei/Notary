import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { leaderboard, MIN_REVEALS, nowOf, statsFor, useRegister } from '../data/store'
import type { AgentStats, Outcome, Receipt } from '../data/types'
import { addressUrl, txUrl } from '../lib/chain'
import { pct, utcDate, utcTime } from '../lib/format'
import { shortHash } from '../lib/receipt'
import { Chart } from '../ui/Chart'
import { OutcomePill } from '../ui/Pill'
import { RecordStrip } from '../ui/RecordStrip'
import { Seal } from '../ui/Seal'
import { Copy } from './Copy'
import { Shell } from './Shell'
import { Loading } from './States'

const DAY = 86_400_000
const PAGE = 12

export default function AgentPage() {
  const { id = '' } = useParams()
  const { register, error, refresh } = useRegister()
  const agent = register?.agents.find((a) => a.id.toLowerCase() === id.toLowerCase())
  const name = agent?.name ?? 'Agent'
  return (
    <Shell screen={name}>
      {!register ? <Loading title={name} error={error} retry={refresh} />
        : !agent ? <NotFound id={id} />
        : <Record stats={statsFor(agent, register.receipts)} />}
    </Shell>
  )
}

function NotFound({ id }: { id: string }) {
  return (
    <>
      <div className="title-row"><div><h1>No agent at this address</h1><p className="sub"><code>{id}</code> has not called registerAgent on NotaryRegistry.</p></div></div>
      <p className="empty">Check the address, or <Link className="card-link" to="/leaderboard">open the leaderboard</Link></p>
    </>
  )
}

// Accuracy at the end of each day, from the reveals made up to then; null until the first reveal.
function dailyAccuracy(receipts: Receipt[], from: number, now: number) {
  const first = Math.floor(from / DAY) * DAY
  const labels: string[] = []
  const values: (number | null)[] = []
  for (let d = first; d <= now; d += DAY) {
    const done = receipts.filter((r) => r.revealedAt && r.revealedAt < Math.min(d + DAY, now + 1))
    const t = done.filter((r) => r.outcome === 'true').length
    labels.push(utcDate(d))
    values.push(done.length ? t / done.length : null)
  }
  return { labels, values }
}

type Tab = 'all' | Outcome

function Record({ stats }: { stats: AgentStats }) {
  const { register } = useRegister()
  const reg = register!
  const now = nowOf(reg)
  const { agent, receipts } = stats
  const rank = useMemo(() => leaderboard(reg).ranked.findIndex((s) => s.agent.id === agent.id), [reg, agent.id])
  const daily = useMemo(() => dailyAccuracy(receipts, agent.registeredAt, now), [receipts, agent.registeredAt, now])
  const [tab, setTab] = useState<Tab>('all')
  const [shown, setShown] = useState(PAGE)
  const newest = useMemo(() => [...receipts].reverse(), [receipts])
  const rows = tab === 'all' ? newest : newest.filter((r) => r.outcome === tab)
  const counts = { all: receipts.length, sealed: stats.awaiting, true: stats.trues, false: stats.falses }

  console.assert(stats.trues + stats.falses + stats.awaiting === receipts.length, 'every receipt is sealed, true or false')
  const recent = receipts.filter((r) => r.outcome !== 'sealed').sort((a, b) => a.revealedAt! - b.revealedAt!).slice(-10)
  const recentTrue = recent.filter((r) => r.outcome === 'true').length

  return (
    <>
      <div className="title-row">
        <div>
          <h1><Seal size={22} />{agent.name}</h1>
          <p className="sub">
            {stats.accuracy === null
              ? `No reveals yet, so no score. ${stats.awaiting} sealed ${stats.awaiting === 1 ? 'claim waits' : 'claims wait'} for an outcome.`
              : <><strong>{stats.trues} of {stats.revealed}</strong> revealed claims came true{recent.length === 10 && <>; {recentTrue} of the last 10</>}. {stats.awaiting} sealed, awaiting reveal.</>}
          </p>
        </div>
        <div className="title-actions">
          <a className="btn" href={addressUrl(agent.id)}>View on botscan</a>
        </div>
      </div>

      <div className="agent-top">
        <section className="panel" aria-labelledby="acc-title">
          <header><h2 id="acc-title">Accuracy</h2><span className="meta">{rank >= 0 ? `Rank ${rank + 1} of ${leaderboard(reg).ranked.length}` : stats.revealed < MIN_REVEALS ? `Ranks after ${MIN_REVEALS} reveals` : ''}</span></header>
          <p className="figure">{pct(stats.accuracy)}</p>
          <p className="figure-sub">{stats.revealed ? `${stats.trues} true, ${stats.falses} false` : 'No reveals yet'}</p>
          <div className="agent-strip"><RecordStrip receipts={receipts.slice(-24)} /><span className="faint">Last {Math.min(24, receipts.length)}, oldest first</span></div>
          <dl className="kv">
            <div><dt>Chain head</dt><dd><code>{shortHash(stats.head, 8, 6)}</code> <Copy text={stats.head} /></dd></div>
            <div><dt>Receipts</dt><dd className="num">{receipts.length}</dd></div>
            <div><dt>Kind of claim</dt><dd>{agent.kind}</dd></div>
            <div><dt>Owner and agent ID</dt><dd><code>{shortHash(agent.id)}</code> <Copy text={agent.id} /></dd></div>
            <div><dt>Registered</dt><dd className="num">{utcDate(agent.registeredAt)}, {utcTime(agent.registeredAt)} UTC <a className="tx" href={txUrl(agent.registerTx)}>tx</a></dd></div>
          </dl>
        </section>

        <section className="panel" aria-labelledby="trend-title">
          <header><h2 id="trend-title">Accuracy after each day’s reveals</h2><span className="meta">50% dashed</span></header>
          {daily.values.some((v) => v !== null) ? (
            <Chart kind="line" opts={{ labels: daily.labels, series: [{ name: 'Accuracy', values: daily.values }], format: 'pct1', tickFormat: 'pct0', yTicks: [0, 0.25, 0.5, 0.75, 1], reference: { value: 0.5, label: '50%' }, height: 280, endLabel: true }} />
          ) : (
            <p className="empty">Nothing revealed yet. The line starts with the first reveal.</p>
          )}
          <p className="agent-about">{agent.about}</p>
        </section>
      </div>

      <section className="panel flush register" aria-labelledby="register-title">
        <header><h2 id="register-title">The register</h2><span className="meta">Newest first · each receipt’s hash includes the one before it</span></header>
        <div className="tabs" role="tablist" aria-label="Filter receipts">
          {(['all', 'sealed', 'true', 'false'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setShown(PAGE) }}>
              {t === 'all' ? 'All' : t === 'sealed' ? 'Sealed' : t === 'true' ? 'True' : 'False'}<span className="n">{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table className="receipts">
            <thead>
              <tr><th className="n">#</th><th>Claim</th><th className="n">Sealed</th><th className="n">Revealed</th><th>Outcome</th><th>Receipt hash</th><th className="n">Txs</th></tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((r) => (
                <tr key={r.id}>
                  <td className="n chain-cell"><span className="chain-mark"><Seal size={14} variant={r.outcome === 'sealed' ? 'ring' : r.outcome === 'false' ? 'false' : 'solid'} className={`mf-${r.outcome}`} /></span>{r.id}</td>
                  <td className="claim-cell">
                    {r.outcome === 'sealed' ? <span className="faint">Hidden until reveal</span> : <span className="claim">{r.claimText}</span>}
                    <span className="sub">{r.category}</span>
                  </td>
                  <td className="n nowrap">{utcDate(r.sealedAt)}<span className="sub">{utcTime(r.sealedAt, true)} UTC</span></td>
                  <td className="n nowrap">{r.revealedAt ? <>{utcDate(r.revealedAt)}<span className="sub">{utcTime(r.revealedAt, true)} UTC</span></> : <span className="faint">—</span>}</td>
                  <td><OutcomePill outcome={r.outcome} /></td>
                  <td className="nowrap"><code>{shortHash(r.hash)}</code><span className="sub">prev <code>{shortHash(r.prevHash)}</code></span></td>
                  <td className="n nowrap"><a className="tx" href={txUrl(r.sealTx)}>seal</a>{r.revealTx && <span className="sub"><a className="tx" href={txUrl(r.revealTx)}>reveal</a></span>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7}><p className="empty">No {tab} receipts.</p></td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="register-foot">
          <span className="muted">Showing {Math.min(shown, rows.length)} of {rows.length}</span>
          {shown < rows.length && <button className="btn" onClick={() => setShown(shown + PAGE * 2)}>Show {Math.min(PAGE * 2, rows.length - shown)} more</button>}
        </footer>
      </section>
    </>
  )
}
