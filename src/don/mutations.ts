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

/** Codes like "P-02", "X-10", "D03": number-aware order. */
export const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, 'pt-BR', { numeric: true })
