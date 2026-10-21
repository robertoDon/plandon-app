import { describe, it, expect } from 'vitest'
import { findBanned, findHours, findForbidden, ownerPublic, extractCodes } from '../src/domain/textGuard'

describe('findBanned', () => {
  it('matches whole words only, ignoring case and accents', () => {
    expect(findBanned('Preparar com David')).toEqual(['David'])
    expect(findBanned('Davidson e margens')).toEqual([])
    expect(findBanned('A MARGEM do canal')).toEqual(['margem'])
    expect(findBanned('falar com ROBERTO e beto')).toEqual(['Roberto', 'Beto'])
  })
})

describe('findHours', () => {
  it('finds hour amounts, not dates or plain numbers', () => {
    expect(findHours('custa 21,0 h')).toEqual(['21,0 h'])
    expect(findHours('247.47 h em 11/12/2026, R$ 105,6 mi')).toEqual(['247.47 h'])
    expect(findHours('11/12/2026, R$ 105,6 mi, 3.12')).toEqual([])
    expect(findHours('reunião às 18h30 e 5 horas')).toEqual([])
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
