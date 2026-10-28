import type { Receipt } from '../data/types'
import { Seal } from './Seal'

export function RecordStrip({ receipts }: { receipts: Receipt[] }) {
  return (
    <ol className="record-strip" aria-label="Recent outcomes, oldest first">
      {receipts.map((r) => (
        <li key={r.id} className={`rs-${r.outcome}`} title={`#${r.id} ${r.outcome}`}>
          <Seal size={12} variant={r.outcome === 'sealed' ? 'ring' : r.outcome === 'false' ? 'false' : 'solid'} />
        </li>
      ))}
    </ol>
  )
}
