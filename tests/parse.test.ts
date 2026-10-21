import { describe, expect, it } from 'vitest'
import { loadRaw, parseWorkbook } from '../scripts/import/parse'

const sumBy = (blocks: { person_id: string | null; hours: number }[], p: string) =>
  blocks.filter((b) => b.person_id === p).reduce((s, b) => s + b.hours, 0)

describe('parseWorkbook (real snapshot)', () => {
  const r = parseWorkbook(loadRaw())

  it('matches the Painel counts', () => {
    expect(r.deliverables).toHaveLength(19)
    expect(r.deliverables.filter((d) => d.origin === 'instrumento')).toHaveLength(5)
    expect(r.tasks).toHaveLength(85)
    expect(r.blocks).toHaveLength(440)
    expect(r.decisions.map((d) => d.code)).toEqual(
      Array.from({ length: 15 }, (_, i) => `D${String(i + 1).padStart(2, '0')}`),
    )
    expect(r.decisions.find((d) => d.code === 'D02')!.date).toBe('2026-11-06')
    expect(r.open_items.filter((o) => o.kind === 'pendencia')).toHaveLength(26)
    expect(r.open_items.filter((o) => o.kind === 'divergencia')).toHaveLength(6)
    expect(r.to_schedule).toHaveLength(8)
  })

  it('matches the hour totals', () => {
    // the sheet's own note says 505.47 (Painel rounds to 505,5), hence 1 digit of precision
    expect(sumBy(r.blocks, 'david')).toBeCloseTo(505.5, 1)
    expect(sumBy(r.blocks, 'lucas')).toBeCloseTo(482)
    expect(sumBy(r.blocks, 'beto')).toBeCloseTo(240)
    expect(r.to_schedule_plan.reduce((s, p) => s + p.hours, 0)).toBeCloseTo(104)
  })

  it('people and capacity', () => {
    expect(r.people.map((p) => p.id).sort()).toEqual(['beto', 'david', 'lucas'])
    expect(r.people.find((p) => p.id === 'david')!.net_capacity_h).toBeCloseTo(667.3)
    expect(r.people.find((p) => p.id === 'lucas')!.net_capacity_h).toBeNull()
    expect(r.people.find((p) => p.id === 'beto')!.net_capacity_h).toBeNull()
  })

  it('deliverable in-use dates', () => {
    const d312 = r.deliverables.find((d) => d.code === '3.12')!
    expect([d312.in_use_start, d312.in_use_end]).toEqual(['2026-11-23', '2026-11-24'])
    const d34 = r.deliverables.find((d) => d.code === '3.4')!
    expect(d34.in_use_start).toBe('2027-05-07')
    expect(d34.in_use_text).toContain('fora da janela')
    const d37 = r.deliverables.find((d) => d.code === '3.7')!
    expect([d37.in_use_start, d37.in_use_end]).toEqual([null, null])
    expect(d37.in_use_text).toBe('[COMPLETAR]')
  })

  it('open items', () => {
    expect(r.open_items.find((o) => o.code === 'X-04')!.visible_to_terral).toBe(false)
    expect(r.open_items.find((o) => o.code === 'P-26')!.visible_to_terral).toBe(true)
    expect(r.open_items.find((o) => o.code === 'P-07')!.visible_to_terral).toBe(false)
    expect(r.open_items.find((o) => o.code === 'P-01')!.owner_public).toBe('Diretoria Terral com a Don')
    expect(r.open_items.find((o) => o.code === 'P-16')!.status).toBe('resolved')
    expect(r.open_items.find((o) => o.code === 'P-01')!.status).toBe('open')
    expect(r.open_items_internal.find((o) => o.code === 'P-01')!.owner_raw).toBe('David com Júlio')
  })

  it('rituals', () => {
    expect(r.rituals.length).toBeGreaterThanOrEqual(5)
    expect(r.ritual_occurrences.length).toBeGreaterThan(0)
  })

  it('links blocks to tasks and builds dependencies', () => {
    const taskBlocks = r.blocks.filter((b) => b.type.startsWith('Tarefa'))
    expect(taskBlocks.length).toBe(355)
    expect(taskBlocks.every((b) => b.task_id)).toBe(true)
    const ids = new Set(r.tasks.map((t) => t.id))
    expect(r.blocks.every((b) => b.task_id === null || ids.has(b.task_id))).toBe(true)
    const p01 = r.dependencies.filter((d) => d.from_kind === 'open_item' && d.from_ref === 'P-01')
    expect(p01.map((d) => [d.to_code, d.suggested])).toEqual([['3.12', true]])
  })

  it('has no cross-check warnings on the real snapshot', () => {
    expect(r.warnings).toEqual([])
  })
})
