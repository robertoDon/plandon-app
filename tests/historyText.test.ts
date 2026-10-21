// historyText: one pt-BR sentence per history row (spec §10: "Beto mudou a data de 12/11 para 19/11").
import { describe, expect, it } from 'vitest'
import type { HistoryRow } from '../src/domain/types'
import { historyText, historyWhere } from '../src/shared/historyText'

const row = (o: Partial<HistoryRow>): HistoryRow =>
  ({ id: 1, table_name: 'block', row_ref: 'r1', action: 'UPDATE', old: null, new: null, user_id: 'u1', at: '2026-11-10T13:00:00Z', ...o }) as HistoryRow
const names = { u1: 'Beto', u2: 'Lucas', david: 'David', lucas: 'Lucas' }

describe('historyText', () => {
  it('the brief cases', () => {
    expect(historyText({ table_name: 'block', action: 'UPDATE', old: { date: '2026-11-12' }, new: { date: '2026-11-19' }, user_id: 'u1' } as HistoryRow, { u1: 'Beto' }))
      .toBe('Beto mudou a data de 12/11 para 19/11')
    expect(historyText({ table_name: 'block', action: 'UPDATE', old: { done: false }, new: { done: true }, user_id: 'u1' } as HistoryRow, { u1: 'Lucas' }))
      .toBe('Lucas concluiu o bloco')
  })

  it('blocks: whole rows as the trigger stores them, only the changed fields speak', () => {
    const b = { id: 'b1', date: '2026-11-12', week: 'S03', hours: 2, person_id: 'david', description: 'Montar a base', done: false, done_at: null }
    expect(historyText(row({ old: b, new: { ...b, date: '2026-11-19', week: 'S04' } }), names)).toBe('Beto mudou a data de 12/11 para 19/11')
    expect(historyText(row({ old: b, new: { ...b, done: true, done_at: '2026-11-12T12:00:00Z' } }), names)).toBe('Beto concluiu o bloco')
    expect(historyText(row({ old: { ...b, done: true }, new: b }), names)).toBe('Beto reabriu o bloco')
    expect(historyText(row({ old: b, new: { ...b, hours: 3.5 } }), names)).toBe('Beto mudou as horas de 2 h para 3,5 h')
    expect(historyText(row({ old: b, new: { ...b, person_id: 'lucas' } }), names)).toBe('Beto mudou a pessoa de David para Lucas')
    expect(historyText(row({ old: b, new: { ...b, description: 'Montar a base final' } }), names)).toBe('Beto mudou a descrição para "Montar a base final"')
    expect(historyText(row({ old: b, new: { ...b, hours: 3, date: '2026-11-13', week: 'S03' } }), names))
      .toBe('Beto mudou a data de 12/11 para 13/11 e as horas de 2 h para 3 h')
    expect(historyText(row({ action: 'INSERT', old: null, new: b }), names)).toBe('Beto criou o bloco "Montar a base" em 12/11')
    expect(historyText(row({ action: 'DELETE', old: b, new: null }), names)).toBe('Beto apagou o bloco "Montar a base" de 12/11')
  })

  it('tasks', () => {
    const t = { id: 't1', description: 'Calcular o potencial', status: 'not_started', due: null, person_id: 'david' }
    expect(historyText(row({ table_name: 'task', old: t, new: { ...t, status: 'done' } }), names)).toBe('Beto concluiu a tarefa')
    expect(historyText(row({ table_name: 'task', old: t, new: { ...t, status: 'in_progress' } }), names))
      .toBe('Beto mudou a situação da tarefa de não iniciada para em andamento')
    expect(historyText(row({ table_name: 'task', old: t, new: { ...t, due: '2026-12-01' } }), names)).toBe('Beto definiu o prazo como 01/12')
    expect(historyText(row({ table_name: 'task', old: { ...t, due: '2026-12-01' }, new: t }), names)).toBe('Beto limpou o prazo')
    expect(historyText(row({ table_name: 'task', action: 'INSERT', new: t }), names)).toBe('Beto criou a tarefa "Calcular o potencial"')
    expect(historyText(row({ table_name: 'task', action: 'DELETE', old: t }), names)).toBe('Beto apagou a tarefa "Calcular o potencial"')
  })

  it('deliverables: built / in use dates and the published flag', () => {
    const d = { code: '3.1', built_at: null, in_use_at: null, published_flag: null, in_use_confirmed: false, name: 'Segmentação' }
    const t = (n: Record<string, unknown>, o: Record<string, unknown> = d) => historyText(row({ table_name: 'deliverable', old: o, new: { ...o, ...n } }), names)
    expect(t({ built_at: '2026-11-20' })).toBe('Beto marcou como construída em 20/11')
    expect(t({ built_at: null }, { ...d, built_at: '2026-11-20' })).toBe('Beto desmarcou "Construído"')
    expect(t({ built_at: '2026-11-21' }, { ...d, built_at: '2026-11-20' })).toBe('Beto mudou a data de construída de 20/11 para 21/11')
    expect(t({ in_use_at: '2026-12-02' })).toBe('Beto marcou em uso em 02/12')
    expect(t({ in_use_at: null }, { ...d, in_use_at: '2026-12-02' })).toBe('Beto desmarcou "Em uso"')
    expect(t({ published_flag: 'Base atrasada' })).toBe('Beto publicou atenção para a Terral: "Base atrasada"')
    expect(t({ published_flag: null }, { ...d, published_flag: 'x' })).toBe('Beto retirou a atenção publicada')
    expect(t({ in_use_confirmed: true })).toBe('Beto confirmou a data de uso')
    expect(t({ name: 'Segmentação e tier' })).toBe('Beto mudou o nome para "Segmentação e tier"')
  })

  it('open items, decisions, dependencies', () => {
    const o = { code: 'P-01', kind: 'pendencia', status: 'open', due: '2026-11-05', text: 'Base', visible_to_terral: false }
    const oi = (n: Record<string, unknown>, base: Record<string, unknown> = o) => historyText(row({ table_name: 'open_item', old: base, new: { ...base, ...n } }), names)
    expect(oi({ status: 'resolved' })).toBe('Beto resolveu a pendência')
    expect(oi({ status: 'resolved' }, { ...o, kind: 'divergencia' })).toBe('Beto resolveu a divergência')
    expect(oi({ due: '2026-11-12' })).toBe('Beto mudou o prazo de 05/11 para 12/11')
    expect(oi({ text: 'Base de vendas' })).toBe('Beto mudou o texto para "Base de vendas"')
    expect(oi({ visible_to_terral: true })).toBe('Beto deixou visível para a Terral')

    const dc = { code: 'D01', status: 'pending', outcome: null, decided_by: null, decided_at: null }
    expect(historyText(row({ table_name: 'decision', old: dc, new: { ...dc, status: 'decided', outcome: 'Aprovado', decided_by: 'Diretoria', decided_at: '2026-11-10' } }), names))
      .toBe('Beto registrou a decisão: "Aprovado"')
    expect(historyText(row({ table_name: 'decision', old: { ...dc, status: 'decided', outcome: 'Aprovado' }, new: dc }), names)).toBe('Beto voltou a decisão para pendente')
    expect(historyText(row({ table_name: 'decision', old: { ...dc, status: 'decided', outcome: 'A' }, new: { ...dc, status: 'decided', outcome: 'B' } }), names))
      .toBe('Beto mudou o resultado para "B"')

    const dep = { id: 'x', from_kind: 'deliverable', from_ref: '3.1', to_code: '3.2', suggested: true }
    expect(historyText(row({ table_name: 'dependency', action: 'INSERT', new: { ...dep, suggested: false } }), names)).toBe('Beto adicionou a dependência 3.1 → 3.2')
    expect(historyText(row({ table_name: 'dependency', action: 'DELETE', old: dep }), names)).toBe('Beto removeu a dependência 3.1 → 3.2')
    expect(historyText(row({ table_name: 'dependency', old: dep, new: { ...dep, suggested: false } }), names)).toBe('Beto confirmou a dependência 3.1 → 3.2')
  })

  it('comments, evidence, profiles', () => {
    expect(historyText(row({ table_name: 'comment', action: 'INSERT', new: { body: 'Tudo certo por aqui' } }), names)).toBe('Beto comentou: "Tudo certo por aqui"')
    expect(historyText(row({ table_name: 'comment', old: { visible_to_terral: true }, new: { visible_to_terral: false } }), names)).toBe('Beto ocultou o comentário da Terral')
    expect(historyText(row({ table_name: 'evidence', action: 'INSERT', new: { file_name: 'ata.pdf' } }), names)).toBe('Beto anexou "ata.pdf"')
    expect(historyText(row({ table_name: 'evidence', action: 'DELETE', old: { file_name: 'ata.pdf' } }), names)).toBe('Beto removeu o arquivo "ata.pdf"')

    const p = { id: 'u9', display_name: 'Ana', role: null, status: 'pending', person_id: null, must_change_password: false }
    expect(historyText(row({ table_name: 'profiles', action: 'INSERT', new: p, user_id: null }), names)).toBe('Ana se cadastrou')
    expect(historyText(row({ table_name: 'profiles', old: p, new: { ...p, role: 'terral', status: 'approved' } }), names)).toBe('Beto liberou o acesso de Ana como Terral')
    expect(historyText(row({ table_name: 'profiles', old: { ...p, role: 'terral', status: 'approved' }, new: { ...p, role: 'don', status: 'approved' } }), names))
      .toBe('Beto mudou o acesso de Ana de Terral para Don')
    expect(historyText(row({ table_name: 'profiles', old: { ...p, status: 'approved' }, new: { ...p, status: 'blocked' } }), names)).toBe('Beto bloqueou o acesso de Ana')
    expect(historyText(row({ table_name: 'profiles', old: p, new: { ...p, must_change_password: true } }), names)).toBe('Beto gerou uma senha temporária para Ana')
    expect(historyText(row({ table_name: 'profiles', action: 'DELETE', old: p, user_id: null }), names)).toBe('Sistema apagou a conta de Ana')
  })

  it('fallbacks: unknown table or field, no user, missing old/new', () => {
    expect(historyText(row({ table_name: 'mystery', old: { x: 1 }, new: { x: 2 } }), names)).toBe('Beto alterou x de mystery')
    expect(historyText(row({ table_name: 'block', old: { zzz: 1 }, new: { zzz: 2 } }), names)).toBe('Beto alterou zzz do bloco')
    expect(historyText(row({ user_id: null, old: { date: '2026-11-12' }, new: { date: '2026-11-19' } }), names)).toBe('Sistema mudou a data de 12/11 para 19/11')
    expect(historyText(row({ user_id: 'gone', old: { done: false }, new: { done: true } }), names)).toBe('Alguém concluiu o bloco')
    expect(historyText(row({ old: null, new: null }), names)).toBe('Beto alterou o bloco')
    expect(historyText(row({ old: 'junk' as unknown, new: 7 as unknown }), names)).toBe('Beto alterou o bloco')
    expect(historyText(row({ action: 'INSERT', table_name: 'mystery', new: null }), names)).toBe('Beto criou um registro em mystery')
    expect(historyText(row({ action: 'DELETE', table_name: 'block', old: null }), names)).toBe('Beto apagou o bloco')
    const many = { a: 1, date: '2026-11-12', hours: 1, person_id: 'david', description: 'x', type: 'Tarefa' }
    expect(historyText(row({ old: many, new: { ...many, date: '2026-11-13', hours: 2, person_id: 'lucas', description: 'y', type: 'Rito' } }), names))
      .toBe('Beto mudou a data de 12/11 para 13/11, as horas de 1 h para 2 h, a pessoa de David para Lucas e mais 2 alterações')
  })

  it('historyWhere names the thing that changed', () => {
    expect(historyWhere(row({ new: { date: '2026-11-12', description: 'Montar a base', code: '3.1' } }))).toBe('Bloco de 12/11 · 3.1 · Montar a base')
    expect(historyWhere(row({ table_name: 'deliverable', row_ref: '3.1', new: { code: '3.1', name: 'Segmentação' } }))).toBe('Entrega 3.1 · Segmentação')
    expect(historyWhere(row({ table_name: 'open_item', row_ref: 'X-01', old: { kind: 'divergencia' } }))).toBe('Divergência X-01')
    expect(historyWhere(row({ table_name: 'comment', new: { entity_kind: 'deliverable', entity_ref: '3.1' } }))).toBe('Comentário em 3.1')
    expect(historyWhere(row({ table_name: 'mystery', row_ref: 'k' }))).toBe('mystery k')
  })
})
