import { describe, expect, it } from 'vitest'
import { decisionErrors, terralErrors, terralTextError } from '../src/don/forms'
import { fmtHours1 } from '../src/don/team'
import { slackOf } from '../src/domain/risk'
import { realPlan } from './helpers/realPlan'

describe('terralTextError', () => {
  it('blocks a Don name and says which', () => {
    expect(terralTextError('Fala com o David')).toMatch(/David/)
  })
  it('blocks "margem"', () => {
    expect(terralTextError('reduz a margem')).toMatch(/margem/)
  })
  it('blocks Don hours', () => {
    expect(terralTextError('custa 21,0 h')).toMatch(/21,0 h/)
  })
  it('blocks every spelling of hours, and hidden characters in a name', () => {
    for (const t of ['8 horas', '2h30', '21  h', '21 hrs']) expect(terralTextError(t)).toMatch(/horas da Don/)
    expect(terralTextError('Fala com o Da\u200Bvid')).toMatch(/David/)
    expect(terralTextError('Fala com o Dávid')).toMatch(/David/)
  })
  it('lets clean text through, and empty fields', () => {
    expect(terralTextError('Base de vendas pendente')).toBeNull()
    expect(terralErrors({})).toEqual({})
    expect(terralErrors({ text: '', effect: 'Equipe Don revisa' })).toEqual({})
  })
  it('folds case and accents, and ignores partial words', () => {
    expect(terralTextError('falar com o DAVID')).toMatch(/David/)
    expect(terralTextError('Davidson')).toBeNull()
  })
  it('terralErrors names every offending field', () => {
    const e = terralErrors({ text: 'ok', effect: 'margem', owner_public: 'Lucas' })
    expect(Object.keys(e)).toEqual(['effect', 'owner_public'])
  })
})

describe('decisionErrors', () => {
  const base = { status: 'decided' as const, outcome: 'Aprovado', decided_by: 'Diretoria Terral', decided_at: '2026-11-10' }
  it('a decided decision needs outcome, decided_by and decided_at', () => {
    expect(decisionErrors(base)).toEqual({})
    expect(decisionErrors({ ...base, outcome: '  ' }).outcome).toMatch(/resultado/i)
    expect(decisionErrors({ ...base, decided_by: '' }).decided_by).toMatch(/quem decidiu/i)
    expect(decisionErrors({ ...base, decided_at: '' }).decided_at).toMatch(/data/i)
  })
  it('a pending decision needs nothing', () => {
    expect(decisionErrors({ status: 'pending', outcome: '', decided_by: '', decided_at: '' })).toEqual({})
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
