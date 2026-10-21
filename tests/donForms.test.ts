import { describe, expect, it } from 'vitest'
import { validateDecision, validateTerralVisible, terralErrors } from '../src/don/forms'
import { fmtHours1 } from '../src/don/team'
import { slackOf } from '../src/domain/risk'
import { realPlan } from './helpers/realPlan'

describe('validateTerralVisible', () => {
  it('blocks a Don name and says which', () => {
    expect(validateTerralVisible({ text: 'Fala com o David' })).toMatch(/David/)
  })
  it('blocks "margem"', () => {
    expect(validateTerralVisible({ effect: 'reduz a margem' })).toMatch(/margem/)
  })
  it('blocks Don hours', () => {
    expect(validateTerralVisible({ effect: 'custa 21,0 h' })).toMatch(/21,0 h/)
  })
  it('lets clean text through, and empty fields', () => {
    expect(validateTerralVisible({ text: 'Base de vendas pendente' })).toBeNull()
    expect(validateTerralVisible({})).toBeNull()
    expect(validateTerralVisible({ text: '', effect: 'Equipe Don revisa' })).toBeNull()
  })
  it('folds case and accents, and ignores partial words', () => {
    expect(validateTerralVisible({ text: 'falar com o DAVID' })).toMatch(/David/)
    expect(validateTerralVisible({ text: 'Davidson' })).toBeNull()
  })
  it('terralErrors names every offending field', () => {
    const e = terralErrors({ text: 'ok', effect: 'margem', owner_public: 'Lucas' })
    expect(Object.keys(e)).toEqual(['effect', 'owner_public'])
  })
})

describe('validateDecision', () => {
  const base = { status: 'decided' as const, outcome: 'Aprovado', decided_by: 'Diretoria Terral', decided_at: '2026-11-10' }
  it('a decided decision needs outcome, decided_by and decided_at', () => {
    expect(validateDecision(base)).toBeNull()
    expect(validateDecision({ ...base, outcome: '  ' })).toMatch(/resultado/i)
    expect(validateDecision({ ...base, decided_by: '' })).toMatch(/quem decidiu/i)
    expect(validateDecision({ ...base, decided_at: '' })).toMatch(/data/i)
  })
  it('a pending decision needs nothing', () => {
    expect(validateDecision({ status: 'pending', outcome: '', decided_by: '', decided_at: '' })).toBeNull()
  })
})

describe('slack on the real plan', () => {
  it('David has 25,8 h of slack (shown with one decimal)', () => {
    const p = realPlan()
    const david = p.people.find((x) => x.id === 'david')!
    const slack = slackOf(david, p.blocks, p.to_schedule_plan)!
    expect(slack).toBeCloseTo(25.83, 2)
    expect(fmtHours1(slack)).toBe('25,8 h')
  })
})
