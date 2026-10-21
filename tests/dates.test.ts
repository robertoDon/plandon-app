import { describe, expect, it } from 'vitest'
import { addDays, diffDays, fmtDate, fmtHours, parseBrDate, parseBrRange, parseHours, today } from '../src/domain/dates'

describe('dates', () => {
  it('parseBrDate', () => {
    expect(parseBrDate('26/10/2026')).toBe('2026-10-26')
    expect(parseBrDate('—')).toBeNull()
    expect(parseBrDate('')).toBeNull()
    expect(parseBrDate('31/02/2026')).toBeNull()
  })
  it('parseBrRange', () => {
    expect(parseBrRange('23 e 24/11/2026')).toEqual({ start: '2026-11-23', end: '2026-11-24' })
    expect(parseBrRange('de 30/11/2026 a 29/01/2027')).toEqual({ start: '2026-11-30', end: '2027-01-29' })
    expect(parseBrRange('antes de 18/12/2026')).toEqual({ start: null, end: '2026-12-18' })
    expect(parseBrRange('fora desta etapa')).toEqual({ start: null, end: null })
    expect(parseBrRange('11/12/2026')).toEqual({ start: '2026-12-11', end: '2026-12-11' })
  })
  it('hours', () => {
    expect(parseHours('3,0')).toBe(3)
    expect(parseHours('1.331,5')).toBe(1331.5)
    expect(parseHours('2')).toBe(2)
    expect(fmtHours(3.5)).toBe('3,5 h')
    expect(fmtHours(3)).toBe('3 h')
    expect(fmtHours(0.1 + 0.2)).toBe('0,3 h')
  })
  it('fmt and math', () => {
    expect(fmtDate('2026-10-26')).toBe('26/10')
    expect(fmtDate('2026-10-26', true)).toBe('26/10/2026')
    expect(diffDays('2026-11-06', '2026-10-27')).toBe(10)
    expect(diffDays('2026-11-01', '2026-10-31')).toBe(1)
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('today override via query string', () => {
    window.history.pushState({}, '', '/?today=2026-11-02')
    expect(today()).toBe('2026-11-02')
    window.history.pushState({}, '', '/')
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
