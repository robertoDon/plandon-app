import { describe, expect, it } from 'vitest'
import { applyOverrides, guardHits, type Data } from '../scripts/import/guard'

const base = (): Data => ({
  deliverables: [], decisions: [], to_schedule: [], rituals: [],
  open_items: [
    { code: 'P-01', kind: 'pendencia', text: 'Voltam 21 h à agenda de David', owner_public: 'Equipe Don', due: null, due_text: null, effect: 'ok', status: 'open', visible_to_terral: true },
    { code: 'X-01', kind: 'divergencia', text: 'David, 9 h', owner_public: 'Equipe Don', due: null, due_text: null, effect: null, status: 'open', visible_to_terral: false },
  ],
  goals: [{ id: 'g1', sort: 1, level: 'Grupo', position: 'x', metric: 'Margem da loja', baseline: '[COMPLETAR] — não medido', state: 's', target: null }],
})

describe('guard + overrides', () => {
  it('flags visible hits only (hidden open items are skipped) and goal placeholders', () => {
    const h = guardHits(base())
    expect(h.map((x) => `${x.table}/${x.key}/${x.field}`)).toEqual(['open_item/P-01/text', 'goal/g1/metric', 'goal/g1/baseline'])
    expect(h[0].words).toEqual(['David', '21 h'])
    expect(h[2].words).toEqual(['[COMPLETAR]'])
  })

  it('overrides clear the hits; hiding an item drops it from the guard', () => {
    const d = base()
    applyOverrides(d, [
      { table: 'open_item', key: 'P-01', field: 'text', value: 'Voltam horas à agenda da Equipe Don' },
      { table: 'goal', key: 'g1', field: 'metric', value: 'Rentabilidade da loja' },
      { table: 'goal', key: 'g1', field: 'baseline', value: 'Não medido' },
    ])
    expect(guardHits(d)).toEqual([])
    const e = base()
    applyOverrides(e, [{ table: 'open_item', key: 'P-01', field: 'visible_to_terral', value: false }, { table: 'goal', key: 'g1', field: 'metric', value: 'a' }, { table: 'goal', key: 'g1', field: 'baseline', value: 'b' }])
    expect(guardHits(e)).toEqual([])
  })

  it('rejects stale or malformed overrides', () => {
    expect(() => applyOverrides(base(), [{ table: 'open_item', key: 'P-99', field: 'text', value: 'x' }])).toThrow(/no row/)
    expect(() => applyOverrides(base(), [{ table: 'open_item', key: 'P-01', field: 'owner_raw', value: 'x' }])).toThrow(/bad override/)
    expect(() => applyOverrides(base(), [{ table: 'goal', key: 'g1', field: 'visible_to_terral', value: false }])).toThrow(/only open_item/)
  })
})
