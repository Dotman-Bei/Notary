import type { Outcome } from '../data/types'
import { Seal } from './Seal'

const LABEL: Record<Outcome, string> = { sealed: 'Sealed', true: 'True', false: 'False' }

export function OutcomePill({ outcome }: { outcome: Outcome }) {
  return (
    <span className={`pill pill-${outcome}`}>
      {outcome === 'sealed' && <Seal size={12} variant="ring" />}
      {LABEL[outcome]}
    </span>
  )
}
