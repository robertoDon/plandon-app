import { describe, expect, it } from 'vitest'
import { evaluate, slackOf } from '../src/domain/risk'
import type { Block, Deliverable, Person, ToSchedule, ToSchedulePlan } from '../src/domain/types'
import { windowText } from '../src/don/ScheduleForm'

const david = { id: 'david', net_capacity_h: 40, reserved_h: 0 } as Person
const blocks = (hours: number): Block[] => (hours ? [{ person_id: 'david', hours } as Block] : [])
const plan = (distributed: boolean): ToSchedulePlan[] => [{ to_schedule_id: 'x-1', person_id: 'david', hours: 5, distributed }]

describe('distributed hours and the risk engine', () => {
  it('slack: hours still to schedule count once; once distributed they are only the blocks', () => {
    expect(slackOf(david, [], plan(false))).toBe(35) // 5 h waiting
    expect(slackOf(david, blocks(5), plan(true))).toBe(35) // the same 5 h, now as blocks: not counted twice
    expect(slackOf(david, blocks(5), plan(false))).toBe(30) // blocks and still marked undistributed: counted twice, the flag must be set
    expect(slackOf(david, [], plan(true))).toBe(40) // marked distributed with no blocks yet: nothing counted (Don's call)
  })

  it('confirmed_not_distributed fires until the plan is marked distributed', () => {
    const base = {
      deliverables: [{ code: '3.1', in_use_start: '2026-12-10', in_use_at: null, built_date: null, built_at: null, in_use_end: null, published_flag: null }] as unknown as Deliverable[],
      decisions: [], open_items: [], dependencies: [], people: [david as Person],
      to_schedule: [{ id: 'x-1', code: '3.1', what: 'a', window_start: null, window_end: null, window_text: null, confirmed_date: '2026-11-12' }] as ToSchedule[],
    }
    const rules = (distributed: boolean, confirmed_date: string | null = '2026-11-12') =>
      evaluate({ ...base, to_schedule: [{ ...base.to_schedule[0], confirmed_date }], to_schedule_plan: plan(distributed) }, '2026-11-10').risks.map((r) => r.rule)
    expect(rules(false)).toContain('confirmed_not_distributed')
    expect(rules(true)).not.toContain('confirmed_not_distributed')
    expect(rules(false, null)).not.toContain('confirmed_not_distributed') // Don cleared a wrong confirmation
  })
})

describe('windowText', () => {
  it('reads like the sheet text', () => {
    expect(windowText('2026-11-30', '2027-01-29')).toBe('de 30/11/2026 a 29/01/2027')
    expect(windowText('', '2027-01-29')).toBe('até 29/01/2027')
    expect(windowText('2026-11-30', '')).toBe('a partir de 30/11/2026')
    expect(windowText('', '')).toBeNull()
  })
})
