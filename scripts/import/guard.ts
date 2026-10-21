import { findForbidden } from '../../src/domain/textGuard'
import type { PlanData } from '../../src/domain/types'

export type Data = Pick<PlanData, 'deliverables' | 'decisions' | 'to_schedule' | 'open_items' | 'goals' | 'rituals'>
/** table + key + field -> replacement text, or `false` on open_item.visible_to_terral (hide the item). */
export interface Override { table: string; key: string; field: string; value: string | false }
export interface Hit { table: string; key: string; field: string; words: string[] }

type Row = Record<string, unknown>
const tableRows = (d: Data): Record<string, { rows: Row[]; key: string }> => ({
  deliverable: { rows: d.deliverables as unknown as Row[], key: 'code' },
  decision: { rows: d.decisions as unknown as Row[], key: 'code' },
  to_schedule: { rows: d.to_schedule as unknown as Row[], key: 'id' },
  open_item: { rows: d.open_items as unknown as Row[], key: 'code' },
  goal: { rows: d.goals as unknown as Row[], key: 'id' },
  ritual: { rows: d.rituals as unknown as Row[], key: 'id' },
})

/** Terral-visible text fields per table. open_item rows count only while visible_to_terral. */
const FIELDS: Record<string, string[]> = {
  deliverable: ['name', 'terral_owner', 'in_use_text', 'target_ritual'],
  decision: ['title', 'outcome'],
  to_schedule: ['what'],
  open_item: ['text', 'effect', 'owner_public'],
  goal: ['level', 'position', 'metric', 'baseline', 'state', 'target'],
  ritual: ['name', 'cadence'],
}

/** Applies the overrides in place. An override that matches no row or field is an error (stale file). */
export function applyOverrides(d: Data, overrides: Override[]): void {
  const t = tableRows(d)
  for (const o of overrides) {
    const spec = t[o.table]
    const row = spec?.rows.find((r) => r[spec.key] === o.key)
    if (!row) throw new Error(`override matches no row: ${o.table} ${o.key}`)
    if (o.field === 'visible_to_terral') {
      if (o.table !== 'open_item' || o.value !== false) throw new Error(`only open_item.visible_to_terral may be set, and only to false: ${o.key}`)
    } else if (!FIELDS[o.table].includes(o.field) || typeof o.value !== 'string') {
      throw new Error(`bad override field: ${o.table} ${o.key} ${o.field}`)
    }
    row[o.field] = o.value
  }
}

/** Banned words, Don hour amounts, and (goals, deliverables) unfinished [COMPLETAR] placeholders in Terral-visible text. */
export function guardHits(d: Data): Hit[] {
  const hits: Hit[] = []
  for (const [table, { rows, key }] of Object.entries(tableRows(d)))
    for (const r of rows) {
      if (table === 'open_item' && !r.visible_to_terral) continue
      for (const field of FIELDS[table]) {
        const v = r[field]
        if (typeof v !== 'string') continue
        const words = findForbidden(v)
        if ((table === 'goal' || table === 'deliverable') && /\[COMPLETAR\]/i.test(v)) words.push('[COMPLETAR]')
        if (words.length) hits.push({ table, key: String(r[key]), field, words })
      }
    }
  return hits
}
