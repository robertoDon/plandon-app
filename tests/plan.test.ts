// Plan helpers against the real snapshot: the week code we write on a moved block matches the sheet's count.
import { describe, expect, it } from 'vitest'
import { byCode } from '../src/don/mutations'
import { progressOf, weekCode } from '../src/don/plan'
import { realPlan } from './helpers/realPlan'

describe('plan helpers', () => {
  const p = realPlan()
  it('weekCode(date) equals the imported week of all 440 blocks', () => {
    expect(p.blocks.filter((b) => weekCode(b.date) !== b.week)).toEqual([])
    expect(weekCode('2026-10-26')).toBe('S01')
    expect(weekCode('2027-04-30')).toBe('S27')
  })
  it('deliverables sort 3.1 … 3.14, then I1 … I5', () => {
    expect([...p.deliverables].sort(byCode).map((d) => d.code)).toEqual([
      '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8', '3.9', '3.10', '3.11', '3.12', '3.13', '3.14', 'I1', 'I2', 'I3', 'I4', 'I5',
    ])
  })
  it('progress is the sum of the blocks of the code', () => {
    const total = p.deliverables.reduce((s, d) => s + progressOf(d.code, p.blocks).planned, 0)
    expect(total).toBeCloseTo(p.blocks.filter((b) => p.deliverables.some((d) => d.code === b.code)).reduce((s, b) => s + b.hours, 0))
  })
})
