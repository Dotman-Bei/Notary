import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { addressUrl, CHAIN_ID, EXPLORER, LIVE, NOTARY_ADDRESS } from '../lib/chain'
import { utcDate, utcTime } from '../lib/format'
import { shortHash } from '../lib/receipt'
import { useWallet } from '../lib/wallet'
import { useRegister } from '../data/store'
import { Seal } from '../ui/Seal'
import './app.css'

const icon = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
const Icons = {
  board: <svg {...icon}><path d="M3 13V8M8 13V3M13 13V6" /></svg>,
  feed: <svg {...icon}><path d="M3 4h10M3 8h10M3 12h6" /></svg>,
  agent: <svg {...icon}><circle cx="8" cy="6" r="2.5" /><path d="M3.5 13.5c.8-2.2 2.5-3.3 4.5-3.3s3.7 1.1 4.5 3.3" /></svg>,
  contract: <svg {...icon}><path d="M4 2.5h5.5L12 5v8.5H4z" /><path d="M6.5 8h3M6.5 10.5h3" /></svg>,
}

export function Shell({ screen, children }: { screen: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => { document.title = `${screen} · Notary` }, [screen])
  const { register } = useRegister()

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Notary, home"><Seal size={20} /></Link>
        <span className="screen">{screen}</span>
        <button className="btn grey menu" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(true)}>Menu</button>
      </header>

      <aside id="sidebar" className={open ? 'sidebar open' : 'sidebar'} aria-label="Navigation">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Link to="/" className="brand"><Seal size={20} />Notary</Link>
          <button className="btn grey sheet-close" onClick={() => setOpen(false)}>Close</button>
        </div>
        <p className="scope">BOT Chain mainnet · {CHAIN_ID}</p>
        <nav aria-label="Screens">
          <NavLink to="/leaderboard" className="nav-item" aria-current={pathname.startsWith('/leaderboard') || pathname.startsWith('/agents') ? 'page' : undefined}>{Icons.board}Leaderboard</NavLink>
          <NavLink to="/feed" className="nav-item">{Icons.feed}Commit feed</NavLink>
          <NavLink to="/operator" className="nav-item">{Icons.agent}Your agent</NavLink>
        </nav>
        <p className="group-label">Contract</p>
        {NOTARY_ADDRESS
          ? <a className="nav-item" href={addressUrl(NOTARY_ADDRESS)}>{Icons.contract}NotaryRegistry</a>
          : <a className="nav-item" href={EXPLORER}>{Icons.contract}botscan explorer</a>}
        <span className="nav-meta">{NOTARY_ADDRESS ? <code>{shortHash(NOTARY_ADDRESS)}</code> : 'Contract address not configured'}</span>
        <div className="sidebar-bottom"><WalletRow /></div>
      </aside>

      <main className="canvas">
        {!LIVE && register && (
          <p className="notice" role="note">
            Sample register, as of {utcDate(register.loadedAt)} {utcTime(register.loadedAt)} UTC. Set <code>VITE_NOTARY_ADDRESS</code> and <code>VITE_BOT_RPC_URL</code> to read BOT Chain.
          </p>
        )}
        {children}
      </main>
    </div>
  )
}

function WalletRow() {
  const w = useWallet()
  if (!w.available) return <div className="wallet-row"><span className="dot" /><span className="who">No browser wallet<small>Install an EVM wallet to register</small></span></div>
  if (!w.account) return <button className="btn" style={{ width: '100%' }} onClick={w.connect} disabled={w.connecting}>{w.connecting ? 'Connecting…' : 'Connect wallet'}</button>
  return (
    <div className="wallet-row">
      <span className={w.onBotChain ? 'dot on' : 'dot warn'} />
      <span className="who"><code>{shortHash(w.account)}</code><small>{w.onBotChain ? `BOT Chain · ${CHAIN_ID}` : `Chain ${w.chainId ?? '—'}, not BOT Chain`}</small></span>
      {!w.onBotChain && <button className="btn grey" onClick={w.switchChain}>Switch</button>}
    </div>
  )
}
