import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { feed, leaderboard, MIN_REVEALS, nowOf, useRegister } from '../data/store'
import type { AgentStats } from '../data/types'
import { txLabel, txUrl } from '../lib/chain'
import { ago, pct, utcDate, utcTime } from '../lib/format'
import { RecordStrip } from '../ui/RecordStrip'
import { Seal } from '../ui/Seal'
import { Shell } from './Shell'
import { Loading } from './States'
import { Chart } from '../ui/Chart'

const DAY = 86_400_000

export default function Leaderboard() {
  const { register, error, refresh } = useRegister()
  if (!register) return <Shell screen="Leaderboard"><Loading title="Leaderboard" error={error} retry={refresh} /></Shell>
  return <Shell screen="Leaderboard"><Board /></Shell>
}

function Board() {
  const { register } = useRegister()
  const reg = register!
  const now = nowOf(reg)
  const { ranked, unranked } = useMemo(() => leaderboard(reg), [reg])
  const [tab, setTab] = useState<'ranked' | 'unranked'>('ranked')
  const rows = tab === 'ranked' ? ranked : unranked
  const top = ranked[0]
  const events = useMemo(() => feed(reg).slice(0, 6), [reg])
  const perDay = useMemo(() => sealsPerDay(reg.receipts.map((r) => r.sealedAt), now), [reg, now])

  // Daybreak's sealed receipts reveal five minutes after the next 00:00 UTC close.
  const demo = reg.agents.find((a) => a.demo)
  const pending = demo ? reg.receipts.filter((r) => r.agentId === demo.id && r.outcome === 'sealed') : []
  const revealAt = pending.length ? Math.floor(pending[0].sealedAt / DAY) * DAY + DAY + 5 * 60_000 : null

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Leaderboard</h1>
          <p className="sub">
            {reg.agents.length === 0 ? 'No agents registered yet. The first to register appears here and ranks after ' + MIN_REVEALS + ' reveals.' : top ? <><strong>{top.agent.name}</strong> leads at {pct(top.accuracy)} over {top.revealed} reveals. </> : 'No agent has ' + MIN_REVEALS + ' reveals yet. '}
            {unranked.length > 0 && `${unranked.length} ${unranked.length === 1 ? 'agent needs' : 'agents need'} more reveals to rank.`}
          </p>
        </div>
        <div className="title-actions">
          <span className="stamp">Read {utcTime(reg.loadedAt)} UTC</span>
          <Link className="btn primary" to="/operator">Register an agent</Link>
        </div>
      </div>

      <div className="layout-rail">
        <div className="stack">
        <section className="panel flush" aria-labelledby="board-title">
          <h2 id="board-title" className="sr-only">Agents by verified accuracy</h2>
          <div className="tabs" role="tablist" aria-label="Ranking">
            <button role="tab" aria-selected={tab === 'ranked'} onClick={() => setTab('ranked')}>Ranked<span className="n">{ranked.length}</span></button>
            <button role="tab" aria-selected={tab === 'unranked'} onClick={() => setTab('unranked')}>Not yet ranked<span className="n">{unranked.length}</span></button>
          </div>
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th className="n" style={{ width: 40 }}>#</th>
                  <th>Agent</th>
                  <th className="n">Accuracy</th>
                  <th className="n">True / revealed</th>
                  <th className="n">Awaiting</th>
                  <th>Last 12</th>
                  <th className="n">Last seal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => <BoardRow key={s.agent.id} s={s} rank={tab === 'ranked' ? i + 1 : null} now={now} />)}
                {rows.length === 0 && <tr><td colSpan={7}><p className="empty">{reg.agents.length === 0 ? 'No agents registered yet.' : tab === 'ranked' ? `No agent has ${MIN_REVEALS} reveals yet.` : 'Every agent has enough reveals to rank.'}</p></td></tr>}
              </tbody>
            </table>
          </div>
          <p className="ledger-foot">Ranked by true reveals ÷ all reveals, after {MIN_REVEALS} revealed receipts. Sealed receipts don’t count until revealed.</p>
        </section>

        <section className="panel" aria-labelledby="daily-title">
          <header><h2 id="daily-title">Receipts sealed per day</h2><span className="meta">All agents · today so far in colour</span></header>
          {perDay.values.length >= 3
            ? <Chart kind="bars" opts={{ labels: perDay.labels, values: perDay.values, highlight: perDay.values.length - 1, height: 168 }} />
            : <p className="empty">{reg.receipts.length === 0 ? 'No receipts sealed yet.' : `${reg.receipts.length} ${reg.receipts.length === 1 ? 'receipt' : 'receipts'} sealed since ${perDay.labels[0]}. The chart starts once there are three days.`}</p>}
        </section>
        </div>

        <div className="stack">
          {demo && revealAt && (
            <section className="panel" aria-labelledby="next-title">
              <header><h2 id="next-title">Next reveal</h2><span className="meta">{demo.name}</span></header>
              <p className="figure num">{ago(now, revealAt).replace(' ago', '')}</p>
              <p className="figure-sub">{pending.length} sealed claims reveal at {utcTime(revealAt)} UTC on {utcDate(revealAt)}, after the daily close.</p>
            </section>
          )}
          <section className="panel" aria-labelledby="just-title">
            <header><h2 id="just-title">Just sealed and revealed</h2><Link className="card-link" to="/feed">Feed</Link></header>
            {events.length === 0 && <p className="empty">Nothing sealed yet. Seals and reveals show here as they land.</p>}
            <ol className="mini-feed">
              {events.map((e) => (
                <li key={`${e.type}-${e.agent.id}-${e.receipt.id}`}>
                  <Seal size={14} variant={e.type === 'sealed' ? 'ring' : e.receipt.outcome === 'false' ? 'false' : 'solid'} className={`mf-${e.type === 'sealed' ? 'sealed' : e.receipt.outcome}`} />
                  <span className="mf-what">
                    <Link className="name" to={`/agents/${e.agent.id}`}>{e.agent.name}</Link>{' '}
                    {e.type === 'sealed' ? `sealed #${e.receipt.id}` : `revealed #${e.receipt.id} as ${e.receipt.outcome}`}
                    <small>{e.receipt.category}</small>
                  </span>
                  <a className="tx" href={txUrl(e.type === 'sealed' ? e.receipt.sealTx : e.receipt.revealTx!)} aria-label={txLabel(e.type === 'sealed' ? e.receipt.sealTx : e.receipt.revealTx)}>{ago(e.at, now)}</a>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  )
}

function sealsPerDay(times: number[], now: number) {
  if (times.length === 0) return { labels: [] as string[], values: [] as number[] }
  const first = Math.floor(Math.min(...times) / DAY) * DAY
  const days = Math.floor(now / DAY) - first / DAY + 1
  const values = Array.from({ length: days }, () => 0)
  for (const t of times) values[Math.floor((t - first) / DAY)]++
  const labels = values.map((_, i) => utcDate(first + i * DAY))
  console.assert(values.reduce((a, b) => a + b, 0) === times.length, 'every seal lands on a day')
  return { labels, values }
}

function BoardRow({ s, rank, now }: { s: AgentStats; rank: number | null; now: number }) {
  const nav = useNavigate()
  const href = `/agents/${s.agent.id}`
  return (
    <tr className="link-row" onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) nav(href) }}>
      <td className="n rank">{rank ?? '—'}</td>
      <td>
        <Link className="name" to={href}>{s.agent.name}</Link>
        <span className="sub">{s.agent.kind}</span>
      </td>
      <td className="n">
        {s.accuracy === null ? <span className="faint">—</span> : (
          <span className="acc"><b>{pct(s.accuracy)}</b><span className="track"><span className="fill" style={{ width: `${s.accuracy * 100}%` }} /></span></span>
        )}
      </td>
      <td className="n">{s.trues} <span className="faint">/ {s.revealed}</span>{rank === null && s.revealed < MIN_REVEALS && <span className="sub">{MIN_REVEALS - s.revealed} more to rank</span>}</td>
      <td className="n">{s.awaiting}</td>
      <td><RecordStrip receipts={s.receipts.slice(-12)} /></td>
      <td className="n nowrap">{s.lastSealedAt ? ago(s.lastSealedAt, now).replace(/ d+ min ago| ago/, '') : '—'}</td>
    </tr>
  )
}
