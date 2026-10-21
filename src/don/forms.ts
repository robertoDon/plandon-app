import { DON_NAMES, fold, findBanned, findHours } from '../domain/textGuard'

/**
 * Terral reads these fields, so they must not name a Don person, say "margem" or carry hour amounts.
 * Returns the pt-BR message for the first offending fragment of one text, or null when it is clean.
 */
export function terralTextError(text: string): string | null {
  const word = findBanned(text)[0]
  if (word) {
    if (DON_NAMES.some((n) => fold(n) === fold(word))) return `A Terral vê este texto e "${word}" é da equipe Don. Escreva "Equipe Don".`
    return `A Terral vê este texto e a palavra "${word}" não pode aparecer.`
  }
  const hours = findHours(text)[0]
  return hours ? `A Terral vê este texto e "${hours}" são horas da Don. Tire o valor.` : null
}

/** Error per field name, only for the fields that fail. Run it before every save of a Terral-visible field. */
export function terralErrors(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields)) {
    const e = terralTextError(v ?? '')
    if (e) out[k] = e
  }
  return out
}

/** First error message, or null when every field is clean. */
export function validateTerralVisible(fields: Record<string, string>): string | null {
  return Object.values(terralErrors(fields))[0] ?? null
}

export interface DecisionDraft {
  status: 'pending' | 'decided'
  outcome: string
  decided_by: string
  decided_at: string
}

/** Mirrors the record_decision rules: a decided decision has an outcome, who decided and when. Error per field. */
export function decisionErrors(d: DecisionDraft): Record<string, string> {
  const e: Record<string, string> = {}
  if (d.status !== 'decided') return e
  if (!d.outcome.trim()) e.outcome = 'Escreva o resultado da decisão.'
  if (!d.decided_by.trim()) e.decided_by = 'Diga quem decidiu.'
  if (!d.decided_at) e.decided_at = 'Informe a data da decisão.'
  return e
}

/** First message of decisionErrors, or null. */
export const validateDecision = (d: DecisionDraft): string | null => Object.values(decisionErrors(d))[0] ?? null
