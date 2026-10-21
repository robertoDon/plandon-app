import { describe, it, expect } from 'vitest'
import { findBanned, findHours, findForbidden, ownerPublic, extractCodes } from '../src/domain/textGuard'

describe('findBanned', () => {
  it('matches whole words only, ignoring case and accents', () => {
    expect(findBanned('Preparar com David')).toEqual(['David'])
    expect(findBanned('Davidson e margens')).toEqual([])
    expect(findBanned('A MARGEM do canal')).toEqual(['margem'])
    expect(findBanned('falar com ROBERTO e beto')).toEqual(['Roberto', 'Beto'])
    expect(findBanned('Dávid e DAVID')).toEqual(['David'])
  })
  it('sees through invisible and look-alike characters', () => {
    expect(findBanned('Da\u200Bvid')).toEqual(['David']) // zero-width space
    expect(findBanned('Da\u00ADvid')).toEqual(['David']) // soft hyphen
    expect(findBanned('D\u2060avid')).toEqual(['David']) // word joiner
    expect(findBanned('\u202EDavid')).toEqual(['David']) // bidi mark
    expect(findBanned('Da\u0301vid')).toEqual(['David']) // combining accent
    expect(findBanned('\uFF24avid')).toEqual(['David']) // full-width D
    expect(findBanned('mar\u200Bgem')).toEqual(['margem'])
    expect(findBanned('Davi\u200Bdson')).toEqual([]) // still a whole word
  })
})

describe('findHours', () => {
  it('finds hour amounts, not dates or plain numbers', () => {
    expect(findHours('custa 21,0 h')).toEqual(['21,0 h'])
    expect(findHours('247.47 h em 11/12/2026, R$ 105,6 mi')).toEqual(['247.47 h'])
    expect(findHours('11/12/2026, R$ 105,6 mi, 3.12')).toEqual([])
  })
  it('finds every spelling of an hour amount', () => {
    expect(findHours('8 horas')).toEqual(['8 horas'])
    expect(findHours('1 hora e 2,5 Horas')).toEqual(['1 hora', '2,5 Horas'])
    expect(findHours('2h30')).toEqual(['2h30'])
    expect(findHours('21  h e 21\u00A0h')).toEqual(['21  h', '21\u00A0h'])
    expect(findHours('21 hrs, 3hr')).toEqual(['21 hrs', '3hr'])
    expect(findHours('21\u200B h')).toEqual(['21 h']) // zero-width char inside
    // a clock time cannot be told from a duration: flagged on purpose (documented in textGuard.ts)
    expect(findHours('reunião às 18h30 e às 09h')).toEqual(['18h30', '09h'])
  })
  it('leaves words and plain numbers alone', () => {
    expect(findHours('21 hoje, 3 hospitais, 5 Harvard, fase 2 horário, 10 hectares')).toEqual([])
    expect(findHours('3.12 e I2, 15/10, R$ 40 mil')).toEqual([])
  })
})

describe('findForbidden', () => {
  it('joins names and hours, unique, in order', () => {
    expect(findForbidden('David gasta 2 h; David de novo, margem')).toEqual(['David', 'margem', '2 h'])
    const s = 'Cadência de governança: (a) War Room semanal o período inteiro ou quinzenal a partir de janeiro — medido, semanal custa 21,0 h e deixa 20,4 h sem executar'
    expect(findHours(s)).toEqual(['21,0 h', '20,4 h'])
    expect(findForbidden('Plano limpo')).toEqual([])
  })
})

describe('ownerPublic', () => {
  it('rewrites Don people to public labels', () => {
    expect(ownerPublic('David com Júlio')).toBe('Diretoria Terral com a Don')
    expect(ownerPublic('David')).toBe('Equipe Don')
    expect(ownerPublic('Lucas e Beto')).toBe('Equipe Don')
    expect(ownerPublic('David com a Terral')).toBe('Equipe Don com a Terral')
    expect(ownerPublic('David com o desenvolvedor do BI')).toBe('Equipe Don com a Terral')
    expect(ownerPublic('FP&A')).toBe('FP&A')
    expect(ownerPublic('Terral')).toBe('Terral')
  })
})

describe('extractCodes', () => {
  it('returns deliverable codes only', () => {
    expect(extractCodes('O 3.12 não tem data de uso; ver 3.1 e I2')).toEqual(['3.12', '3.1', 'I2'])
    expect(extractCodes('247.47 h em 11/12/2026, R$ 105,6')).toEqual([])
    expect(extractCodes('3.1 e 3.1, 3.15')).toEqual(['3.1'])
  })
})
