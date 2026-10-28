import { useMemo, useState } from 'react'
import { keccak256, toHex } from 'viem'
import { receiptHash, shortHash } from '../lib/receipt'
import { utcTime } from '../lib/format'
import { Seal } from '../ui/Seal'
import type { AgentStats } from '../data/types'
import { OutcomePill } from '../ui/Pill'

type Phase = 'draft' | 'sealed' | 'true' | 'false' | 'reverted'

// The hero's live thing: type a claim, seal it, change a character, watch the reveal fail.
// Everything is computed in the browser with the contract's own hash; nothing is sent.
export function LiveSeal({ stats }: { stats: AgentStats }) {
  const { agent, receipts } = stats
  const prev = receipts.at(-1)!
  const nextId = prev.id + 1
  const nonce = useMemo(() => keccak256(toHex(`nonce|${agent.name}|${nextId}`)), [agent.name, nextId])
  const [text, setText] = useState('ETH/USD closes above 2,640.00 on 2026-10-30 at 00:00 UTC')
  const [phase, setPhase] = useState<Phase>('draft')
  const [sealed, setSealed] = useState<{ hash: string; at: number } | null>(null)
  const hash = useMemo(() => receiptHash(agent.id, text, nonce, prev.hash), [agent.id, text, nonce, prev.hash])
  const tampered = sealed !== null && hash !== sealed.hash

  const seal = () => { setSealed({ hash, at: Date.now() }); setPhase('sealed') }
  const reveal = (outcome: boolean) => setPhase(tampered ? 'reverted' : outcome ? 'true' : 'false')
  const reset = () => { setSealed(null); setPhase('draft') }

  const status =
    phase === 'draft' ? <span className="pill pill-draft">Draft</span>
    : phase === 'sealed' ? <span className="pill pill-sealed"><Seal size={12} variant="ring" />Sealed {utcTime(sealed!.at, true)} UTC</span>
    : phase === 'reverted' ? <span className="pill pill-false">Reverted</span>
    : <OutcomePill outcome={phase} />

  return (
    <div className="ui live-seal" data-ui>
      <div className="ui-head">
        <Seal size={20} className="ui-mark" />
        <strong>{agent.name}</strong>
        <code className="mono muted">{shortHash(agent.id)}</code>
        <span className="ui-head-end">{status}</span>
      </div>

      <label className="ui-label" htmlFor="claim">Claim for receipt #{nextId}</label>
      <textarea
        id="claim" className="ui-input" rows={2} value={text} spellCheck={false}
        disabled={phase === 'true' || phase === 'false'}
        onChange={(e) => { setText(e.target.value); if (phase === 'reverted') setPhase('sealed') }}
      />

      <dl className="ui-kv">
        <div><dt>Nonce</dt><dd><code className="mono">{shortHash(nonce, 8, 6)}</code></dd></div>
        <div><dt>Previous receipt</dt><dd><span className="muted">#{prev.id}</span> <code className="mono">{shortHash(prev.hash, 8, 6)}</code></dd></div>
      </dl>

      <div className="ui-hash">
        <span className="ui-label">{sealed ? 'Hash of the text as it stands' : 'Receipt hash'}</span>
        <output aria-live="polite"><code className="mono">{hash}</code></output>
        {sealed && <span className={tampered ? 'ui-note is-bad' : 'ui-note'}>{tampered ? 'Differs from the sealed hash' : 'Matches the sealed hash'}</span>}
      </div>

      <div className="ui-actions">
        {phase === 'draft' && <button className="ui-btn ui-btn-primary" onClick={seal}>Seal</button>}
        {(phase === 'sealed' || phase === 'reverted') && (
          <>
            <button className="ui-btn ui-btn-primary" onClick={() => reveal(true)}>Reveal as true</button>
            <button className="ui-btn" onClick={() => reveal(false)}>Reveal as false</button>
          </>
        )}
        {(phase === 'true' || phase === 'false') && <button className="ui-btn" onClick={reset}>Seal another</button>}
        <p className="ui-msg" role="status">
          {phase === 'draft' && 'Computed in your browser. Nothing is sent.'}
          {phase === 'sealed' && 'Now change one character of the claim, then reveal.'}
          {phase === 'reverted' && 'Hash mismatch. The contract would revert.'}
          {(phase === 'true' || phase === 'false') && `Scored ${phase}. The hash matched, so the reveal stands.`}
        </p>
      </div>

      <ol className="ui-chain" aria-label={`${agent.name}'s latest receipts`}>
        {receipts.slice(-4).reverse().map((r) => (
          <li key={r.id}>
            <Seal size={14} variant={r.outcome === 'sealed' ? 'ring' : 'solid'} />
            <span className="muted">#{r.id}</span>
            <span>{r.category}</span>
            <code className="mono muted">{shortHash(r.hash)}</code>
            <OutcomePill outcome={r.outcome} />
          </li>
        ))}
      </ol>
    </div>
  )
}
