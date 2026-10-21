import type { Severity } from '../domain/types'
import type { Tone } from './Pill'

/** Severity → tone and the pt-BR word for a Pill next to the bar. */
export const SEVERITY: Record<Severity, { tone: Tone; label: string }> = {
  high: { tone: 'bad', label: 'Crítico' },
  medium: { tone: 'warn', label: 'Atenção' },
  low: { tone: 'mute', label: 'Baixo' },
}

/** 4px colored bar down the left of a risk row (stretches to the row height). Decorative: pair it with a Pill. */
export function SeverityBar({ severity }: { severity: Severity }) {
  return <span className={`ui-sev ${SEVERITY[severity].tone}`} aria-hidden="true" />
}
