import type { PlanData } from './types'

export type TerralData = Pick<
  PlanData,
  | 'deliverables' | 'rituals' | 'ritual_occurrences' | 'decisions' | 'to_schedule'
  | 'open_items' | 'goals' | 'dependencies' | 'comments' | 'evidence'
>

/** The tables Terral reads itself (useTerralData). Every one must be Terral-readable under RLS. */
export const TERRAL_KEYS = [
  'deliverables', 'rituals', 'ritual_occurrences', 'decisions', 'to_schedule', 'open_items', 'goals', 'dependencies', 'comments', 'evidence',
] as const satisfies readonly (keyof TerralData)[]

/**
 * What Terral can read, row for row as the RLS in 0002_security.sql / 0004_hardening.sql:
 * open items only when visible_to_terral; dependencies, comments and evidence only on
 * Terral-visible entities (public.terral_visible); comments and evidence only when flagged visible.
 */
export function toTerralData(p: PlanData): TerralData {
  const open_items = p.open_items.filter((o) => o.visible_to_terral)
  const ids: Record<string, string[]> = {
    deliverable: p.deliverables.map((d) => d.code),
    decision: p.decisions.map((d) => d.code),
    to_schedule: p.to_schedule.map((t) => t.id),
    goal: p.goals.map((g) => g.id),
    open_item: open_items.map((o) => o.code),
  }
  // mirrors public.terral_visible(kind, ref): any other kind (task, block, ritual, person, ...) is Don-only
  const visible = (kind: string, ref: string) => Object.hasOwn(ids, kind) && ids[kind].includes(ref)

  return {
    deliverables: p.deliverables,
    rituals: p.rituals,
    ritual_occurrences: p.ritual_occurrences,
    decisions: p.decisions,
    to_schedule: p.to_schedule,
    goals: p.goals,
    open_items,
    dependencies: p.dependencies.filter((d) => visible(d.from_kind, d.from_ref) && visible('deliverable', d.to_code)),
    comments: p.comments.filter((c) => c.visible_to_terral && visible(c.entity_kind, c.entity_ref)),
    evidence: p.evidence.filter((e) => e.visible_to_terral && visible(e.entity_kind, e.entity_ref)),
  }
}
