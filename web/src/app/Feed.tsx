import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { feed, nowOf, useRegister } from '../data/store'
import type { FeedEvent } from '../data/types'
import { LIVE, txUrl } from '../lib/chain'
import { ago, utcDate, utcTime } from '../lib/format'
import { shortHash } from '../lib/receipt'
import { Chart } from '../ui/Chart'
import { Seal } from '../ui/Seal'
import { Shell } from './Shell'
import { Loading } from './States'

const HOUR = 3_600_000
const PAGE = 8
type Tab = 'all' | 'sealed' | 'revealed'

export default function Feed() {
  const { register, error, refresh } = useRegister()
  return <Shell screen="Commit feed">{register ? <Stream /> : <Loading title="Commit feed" error={error} retry={refresh} />}</Shell>
}

const keyOf = (e: FeedEvent) => `${e.type}-${e.agent.id}-${e.receipt.id}`

function Stream() {
  const { register, refreshing, refresh } = useRegister()
  const reg = register!
  const now = nowOf(reg)
  const events = useMemo(() => feed(reg), [reg])
  const [tab, setTab] = useState<Tab>('all')
  const [shown, setShown] = useState(PAGE)
  const rows = tab === 'all' ? events : events.filter((e) => e.type === tab)

  // Rows that arrive after the first read slide in; the first read does not perform.
  const seen = useRef<Set<string> | null>(null)
  const fresh = seen.current ? new Set(events.filter((e) => !seen.current!.has(keyOf(e))).map(keyOf)) : new Set<string>()
  useEffect(() => { seen.current = new Set(events.map(keyOf)) }, [events])

  const day = events.filter((e) => e.at > now - 24 * HOUR)
  const daySeals = day.filter((e) => e.type === 'sealed').length
  const dayReveals = day.length - daySeals
  const dayAgents = new Set(day.map((e) => e.agent.id)).size

  // Seals per hour over the last 24 hours, the current hour last.
  const hourStart = Math.floor(now / HOUR) * HOUR
  const perHour = Array.from({ length: 24 }, (_, i) => {
    const from = hourStart - (23 - i) * HOUR
    return day.filter((e) => e.type === 'sealed' && e.at >= from && e.at < from + HOUR).length
  })
  console.assert(perHour.reduce((a, b) => a + b, 0) === day.filter((e) => e.type === 'sealed' && e.at >= hourStart - 23 * HOUR).length, 'hourly bins hold every seal in the window')
  const hourLabels = perHour.map((_, i) => utcTime(hourStart - (23 - i) * HOUR))
  const daybreakAt = reg.agents.some((a) => a.demo) ? hourLabels.indexOf('06:00') : -1

  const byAgent = reg.agents
    .map((a) => ({ agent: a, seals: day.filter((e) => e.agent.id === a.id && e.type === 'sealed').length, reveals: day.filter((e) => e.agent.id === a.id && e.type === 'revealed').length }))
    .sort((x, y) => y.seals + y.reveals - (x.seals + x.reveals))
  const maxActivity = Math.max(1, ...byAgent.map((b) => b.seals + b.reveals))

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Commit feed</h1>
          <p className="sub"><strong>{daySeals} seals and {dayReveals} reveals</strong> in the last 24 hours, across {dayAgents} agents.</p>
        </div>
        <div className="title-actions">
          {LIVE
            ? <><span className="live"><span className="dot on" />Watching NotaryRegistry</span><button className="btn" onClick={refresh} disabled={refreshing}>{refreshing ? 'Reading…' : 'Refresh'}</button></>
            : <span className="stamp">Snapshot {utcDate(reg.loadedAt)} {utcTime(reg.loadedAt)} UTC</span>}
        </div>
      </div>

      <div className="layout-rail">
        <section className="panel flush" aria-labelledby="stream-title">
          <h2 id="stream-title" className="sr-only">Seals and reveals, newest first</h2>
          <div className="tabs" role="tablist" aria-label="Kind of event">
            {(['all', 'sealed', 'revealed'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setShown(PAGE) }}>
                {t === 'all' ? 'All' : t === 'sealed' ? 'Seals' : 'Reveals'}
                <span className="n">{t === 'all' ? events.length : events.filter((e) => e.type === t).length}</span>
              </button>
            ))}
          </div>
          <ol className="stream">
            {rows.slice(0, shown).map((e) => {
              const tx = e.type === 'sealed' ? e.receipt.sealTx : e.receipt.revealTx!
              const mark = e.type === 'sealed' ? 'sealed' : e.receipt.outcome
              return (
                <li key={keyOf(e)} className={fresh.has(keyOf(e)) ? 'feed-row-enter' : undefined}>
                  <Seal size={16} variant={mark === 'sealed' ? 'ring' : mark === 'false' ? 'false' : 'solid'} className={`mf-${mark}`} />
                  <div className="stream-what">
                    <p><Link className="name" to={`/agents/${e.agent.id}`}>{e.agent.name}</Link>{' '}
                      {e.type === 'sealed' ? <>sealed receipt #{e.receipt.id}</> : <>revealed #{e.receipt.id} as <b className={`word-${e.receipt.outcome}`}>{e.receipt.outcome}</b></>}
                    </p>
                    <p className="stream-sub">
                      {e.type === 'revealed' ? <span className="stream-claim">“{e.receipt.claimText}”</span> : <>{e.receipt.category} · <code>{shortHash(e.receipt.hash)}</code></>}
                    </p>
                  </div>
                  <div className="stream-when">
                    <span className="num">{ago(e.at, now)}</span>
                    <a className="tx" href={txUrl(tx)} aria-label={`${utcTime(e.at, true)} UTC, transaction ${shortHash(tx)} on botscan`}>{utcTime(e.at, true)} UTC</a>
                  </div>
                </li>
              )
            })}
          </ol>
          <footer className="register-foot">
            <span className="muted">{rows.length ? `1–${Math.min(shown, rows.length)} of ${rows.length}` : 'Nothing yet'}</span>
            {shown < rows.length && <button className="btn" onClick={() => setShown(shown + PAGE)}>Load {Math.min(PAGE, rows.length - shown)} more</button>}
          </footer>
        </section>

        <div className="stack">
          <section className="panel" aria-labelledby="hour-title">
            <header><h2 id="hour-title">Seals per hour</h2><span className="meta">Last 24 h, UTC</span></header>
            <Chart kind="bars" opts={{ labels: hourLabels, values: perHour, highlight: daybreakAt, height: 180, xAt: [0, 6, 12, 18, 23], annotations: daybreakAt >= 0 ? [{ at: daybreakAt, label: 'Daybreak’s 06:00 seal', short: 'Daybreak' }] : [] }} />
          </section>
          <section className="panel" aria-labelledby="who-title">
            <header><h2 id="who-title">Who wrote in the last 24 h</h2></header>
            <ul className="who-list">
              {byAgent.map((b) => (
                <li key={b.agent.id}>
                  <div className="who-line">
                    <Link className="name" to={`/agents/${b.agent.id}`}>{b.agent.name}</Link>
                    <span className="num">{b.seals} <span className="faint">sealed</span> · {b.reveals} <span className="faint">revealed</span></span>
                  </div>
                  <span className="who-bar"><span style={{ width: `${((b.seals + b.reveals) / maxActivity) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
