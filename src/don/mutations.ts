import type { DonData } from '../lib/data'
import type { PlanData } from '../domain/types'

type Rows<K extends keyof PlanData> = PlanData[K][number]

/** Optimistic helper: `change` merged into the rows of `key` that `is` matches. */
export function patchRows<K extends keyof PlanData>(old: DonData, key: K, is: (r: Rows<K>) => boolean, change: Record<string, unknown>): DonData {
  return { ...old, [key]: (old[key] as Rows<K>[]).map((r) => (is(r) ? { ...r, ...change } : r)) }
}

/** Optimistic helper: `row` appended to `key`. */
export function addRow<K extends keyof PlanData>(old: DonData, key: K, row: Rows<K>): DonData {
  return { ...old, [key]: [...(old[key] as Rows<K>[]), row] }
}

export type ConfirmRpc = { rpc: { p_kind: string; p_ref: string; p_date: string } }
/** confirm_date (0002) on Don's plan cache: a Don user confirms in meeting mode. */
export const confirmOnPlan = (old: DonData, { rpc: r }: ConfirmRpc): DonData => r.p_kind === 'deliverable'
  ? patchRows(old, 'deliverables', (d) => d.code === r.p_ref, { in_use_start: r.p_date, in_use_end: r.p_date, in_use_confirmed: true })
  : patchRows(old, 'to_schedule', (s) => s.id === r.p_ref, { confirmed_date: r.p_date })

export type DecisionRpc = { rpc: { p_code: string; p_outcome: string; p_decided_by: string; p_decided_at: string } }
/** record_decision (0004) on Don's plan cache: a Don user records in meeting mode. */
export const decideOnPlan = (old: DonData, { rpc: r }: DecisionRpc): DonData =>
  patchRows(old, 'decisions', (d) => d.code === r.p_code, { status: 'decided', outcome: r.p_outcome, decided_by: r.p_decided_by, decided_at: r.p_decided_at })

/** Codes like "P-02", "X-10", "D03": number-aware order. */
export const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, 'pt-BR', { numeric: true })
