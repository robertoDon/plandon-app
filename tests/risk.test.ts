import { describe, expect, it } from 'vitest'
import { evaluate, type RuleId } from '../src/domain/risk'
import { toTerralData } from '../src/domain/terralView'
import { realPlan } from './helpers/realPlan'
import { findForbidden } from '../src/domain/textGuard'
import type { Block, Deliverable, PlanData } from '../src/domain/types'

const TODAY = '2026-11-10'

const del = (code: string, p: Partial<Deliverable> = {}): Deliverable => ({
  code, name: `Entrega ${code}`, front: 'Vendas', origin: 'escopo2',
  built_date: '2027-03-01', in_use_start: '2027-03-10', in_use_end: null, in_use_text: null, in_use_confirmed: false,
  built_at: null, in_use_at: null, target_ritual: null, terral_owner: null, published_flag: null, sort: 0, ...p,
})

let n = 0
const blk = (p: Partial<Block>): Block => ({
  id: `b${++n}`, date: '2026-11-12', week: 'S03', type: 'Tarefa', front: 'Vendas', code: null, description: 'x',
  person_id: 'david', hours: 1, due: null, task_id: null, done: false, done_at: null, ...p,
})

/** Minimal valid PlanData: one person, two quiet deliverables. */
function mk(): PlanData {
  return {
    people: [{ id: 'david', name: 'David', net_capacity_h: null, reserved_h: 0, daily_cap_h: 8, weekly_cap_h: 40 }],
    deliverables: [del('3.1'), del('I2')],
    tasks: [], blocks: [], rituals: [], ritual_occurrences: [], decisions: [], to_schedule: [], to_schedule_plan: [],
    open_items: [], open_items_internal: [], goals: [], traceability: [], dependencies: [], manual_risks: [],
    comments: [], evidence: [],
  }
}

const of = (p: PlanData, rule: RuleId, today = TODAY) => evaluate(p, today).risks.filter((r) => r.rule === rule)

const dep = (from_kind: PlanData['dependencies'][number]['from_kind'], from_ref: string, to_code: string, suggested = false) =>
  ({ id: `${from_kind}:${from_ref}:${to_code}`, from_kind, from_ref, to_code, suggested })

describe('decision_late_blocking', () => {
  const withDecision = (status: 'pending' | 'decided') => {
    const p = mk()
    p.decisions.push({ code: 'D02', title: 'T', date: '2026-11-06', prepared_on: null, status, outcome: null, decided_by: null, decided_at: null })
    p.dependencies.push(dep('decision', 'D02', '3.1'), dep('deliverable', '3.1', 'I2'))
    return p
  }
  it('flags a late pending decision with the transitive chain', () => {
    const r = of(withDecision('pending'), 'decision_late_blocking')
    expect(r).toHaveLength(1)
    expect(r[0].severity).toBe('high')
    expect(r[0].codes).toEqual(['3.1', 'I2'])
  })
  it('is silent once decided', () => {
    expect(of(withDecision('decided'), 'decision_late_blocking')).toEqual([])
  })
})

describe('day_over_capacity', () => {
  const day = (...hs: [number, string?][]) => {
    const p = mk()
    hs.forEach(([hours, type]) => p.blocks.push(blk({ hours, type: type ?? 'Tarefa' })))
    return of(p, 'day_over_capacity')
  }
  it('medium up to 2 h over, high beyond', () => {
    expect(day([6], [4]).map((r) => r.severity)).toEqual(['medium'])
    expect(day([6], [5]).map((r) => r.severity)).toEqual(['high'])
  })
  it('9 h cap on travel days', () => {
    expect(day([8], [1, 'Deslocamento'])).toEqual([])
    expect(day([5], [4, 'Bloco presencial'])).toEqual([])
    expect(day([6], [4, 'Bloco presencial']).map((r) => r.severity)).toEqual(['medium'])
  })
})

it('week_over_capacity: 41 h in S03 is medium', () => {
  const p = mk()
  for (const d of ['16', '17', '18', '19', '20']) p.blocks.push(blk({ date: `2026-11-${d}`, hours: 8 }))
  p.blocks.push(blk({ date: '2026-11-21', hours: 1 }))
  const r = of(p, 'week_over_capacity')
  expect(r.map((x) => [x.severity, x.ref])).toEqual([['medium', 'S03']])
  expect(of(p, 'day_over_capacity')).toEqual([])
})

describe('hours_unconfirmed', () => {
  const ts = (window_end: string) => {
    const p = mk()
    p.to_schedule.push({ id: '3.1-1', code: '3.1', what: 'x', window_start: '2026-10-26', window_end, window_text: null, confirmed_date: null })
    return of(p, 'hours_unconfirmed')
  }
  it('medium within 21 days, high once closed', () => {
    expect(ts('2026-11-25').map((r) => r.severity)).toEqual(['medium'])
    expect(ts('2026-11-01').map((r) => r.severity)).toEqual(['high'])
    expect(ts('2026-12-10')).toEqual([])
  })
})

it('confirmed_not_distributed: confirmed in 4 days and not spread is high', () => {
  const p = mk()
  p.to_schedule.push({ id: '3.1-1', code: '3.1', what: 'x', window_start: null, window_end: null, window_text: null, confirmed_date: '2026-11-14' })
  p.to_schedule_plan.push({ to_schedule_id: '3.1-1', person_id: 'david', hours: 4, distributed: false })
  const r = of(p, 'confirmed_not_distributed')
  expect(r.map((x) => x.severity)).toEqual(['high'])
  expect(r[0].codes).toEqual(['3.1'])
  p.to_schedule_plan[0].distributed = true
  expect(of(p, 'confirmed_not_distributed')).toEqual([])
})

describe('terral_dependency_overdue', () => {
  const overdue = (built_date: string, in_use_start: string) => {
    const p = mk()
    p.deliverables[0] = del('3.1', { built_date, in_use_start })
    p.open_items.push({ code: 'P-26', kind: 'pendencia', text: 't', owner_public: 'Terral', due: '2026-10-26', due_text: null, effect: null, status: 'open', visible_to_terral: true })
    p.dependencies.push(dep('open_item', 'P-26', '3.1', true))
    return of(p, 'terral_dependency_overdue')
  }
  it('high when the deliverable is within 14 days, else medium', () => {
    const r = overdue('2026-11-20', '2026-12-01')
    expect(r.map((x) => x.severity)).toEqual(['high'])
    expect(r[0].codes).toEqual(['3.1'])
    expect(overdue('2027-01-09', '2027-01-20').map((x) => x.severity)).toEqual(['medium'])
  })
})

describe('behind_plan', () => {
  const plan = (done: number) => {
    const p = mk()
    p.blocks.push(blk({ code: '3.1', date: '2026-11-05', hours: done, done: true }))
    if (done < 10) p.blocks.push(blk({ code: '3.1', date: '2026-11-06', hours: 10 - done }))
    p.blocks.push(blk({ code: '3.1', date: TODAY, hours: 5 })) // today does not count yet
    return of(p, 'behind_plan')
  }
  it('low over 15%, medium over 30%', () => {
    expect(plan(8).map((r) => r.severity)).toEqual(['low'])
    expect(plan(6).map((r) => r.severity)).toEqual(['medium'])
    expect(plan(9)).toEqual([])
  })
})

it('slack_exhausted: net 100, blocks 90, undistributed 20 is high', () => {
  const p = mk()
  p.people[0].net_capacity_h = 100
  for (let i = 0; i < 10; i++) p.blocks.push(blk({ date: `2026-12-${String(i + 1).padStart(2, '0')}`, hours: 9, type: 'Bloco presencial' }))
  p.to_schedule.push({ id: '3.1-1', code: '3.1', what: 'x', window_start: null, window_end: null, window_text: null, confirmed_date: null })
  p.to_schedule_plan.push({ to_schedule_id: '3.1-1', person_id: 'david', hours: 20, distributed: false })
  expect(of(p, 'slack_exhausted').map((r) => r.severity)).toEqual(['high'])
  p.people[0].net_capacity_h = 120
  expect(of(p, 'slack_exhausted')).toEqual([])
  p.people[0].reserved_h = 15 // the reserve counts against capacity
  expect(of(p, 'slack_exhausted')).toHaveLength(1)
})

describe('health', () => {
  it('a passed built date without built_at is late, and so is the project', () => {
    const p = mk()
    p.deliverables[0] = del('3.1', { built_date: '2026-11-01' })
    const e = evaluate(p, TODAY)
    expect(e.health['3.1']).toBe('late')
    expect(e.project.status).toBe('late')
    expect(e.project.reasons[0]).toContain('3.1')
    p.deliverables[0].built_at = '2026-11-01'
    expect(evaluate(p, TODAY).health['3.1']).not.toBe('late')
  })
  it('attention from a medium risk or a published flag; at most 3 reasons, late first', () => {
    const p = mk()
    p.deliverables.push(del('3.2', { in_use_start: null }), del('3.3', { published_flag: 'Atenção ao prazo' }))
    p.deliverables.push(del('3.4', { in_use_start: '2026-11-02' }), del('3.5', { in_use_start: null }), del('3.6', { in_use_start: null }))
    const e = evaluate(p, TODAY)
    expect(e.health).toMatchObject({ '3.1': 'on_time', '3.2': 'attention', '3.3': 'attention', '3.4': 'late' })
    expect(e.project.reasons).toHaveLength(3)
    expect(e.project.reasons[0]).toContain('3.4')
  })
})

it('manual risks pass through while open', () => {
  const p = mk()
  p.manual_risks.push(
    { id: 'm1', title: 'Risco', severity: 'medium', links: ['3.1'], person_id: null, status: 'open', note: null, created_by: null },
    { id: 'm2', title: 'Fechado', severity: 'high', links: [], person_id: null, status: 'closed', note: null, created_by: null },
  )
  const r = evaluate(p, TODAY).risks.filter((x) => x.rule === 'manual')
  expect(r.map((x) => [x.id, x.codes])).toEqual([['m1', ['3.1']]])
  expect(evaluate(p, TODAY).health['3.1']).toBe('attention')
})

describe('real data', () => {
  const p = realPlan()

  it('outside the window (2026-10-21): no behind_plan, no past overload, not late', () => {
    const e = evaluate(p, '2026-10-21')
    expect(e.risks.filter((r) => r.rule === 'behind_plan')).toEqual([])
    expect(e.risks.filter((r) => r.rule === 'day_over_capacity' && r.date! < '2026-10-21')).toEqual([])
    expect(e.project.status).not.toBe('late')
  })

  it('risk ids are stable and unique', () => {
    const a = evaluate(p, TODAY).risks.map((r) => r.id)
    expect(evaluate(p, TODAY).risks.map((r) => r.id)).toEqual(a)
    expect(new Set(a).size).toBe(a.length)
  })

  it('Terral subset never yields Don-only rules, and its text holds no Don names or hours', () => {
    const donOnly: RuleId[] = ['day_over_capacity', 'week_over_capacity', 'behind_plan', 'slack_exhausted', 'confirmed_not_distributed']
    // a plan where every Don-only rule fires (positive control)
    const q = realPlan()
    q.people.find((x) => x.id === 'david')!.net_capacity_h = 100
    q.to_schedule[0].confirmed_date = '2026-11-12'
    q.blocks.push(blk({ date: '2026-11-12', hours: 12 }))
    for (const d of ['14', '15', '16', '17', '18']) q.blocks.push(blk({ date: `2026-12-${d}`, week: 'S99', hours: 9 }))
    q.manual_risks.push({ id: 'm1', title: 'David sobrecarregado', severity: 'high', links: ['3.1'], person_id: 'david', status: 'open', note: null, created_by: null })
    const full = new Set(evaluate(q, TODAY).risks.map((r) => r.rule))
    for (const r of donOnly) expect(full).toContain(r)

    for (const today of ['2026-10-21', TODAY, '2026-12-20']) {
      const e = evaluate(toTerralData(q), today)
      expect(e.risks.filter((r) => donOnly.includes(r.rule as RuleId) || r.rule === 'manual')).toEqual([])
      for (const t of [...e.risks.map((r) => r.title), ...e.project.reasons]) expect(findForbidden(t), t).toEqual([])
      expect(e.risks.every((r) => r.person_id === undefined)).toBe(true)
    }
  })
})
