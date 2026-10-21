import { describe, expect, it } from 'vitest'
import { toTerralData } from '../src/domain/terralView'
import { realPlan } from './helpers/realPlan'
import { findBanned } from '../src/domain/textGuard'
import type { Comment, OpenItem } from '../src/domain/types'

const oi = (code: string, visible_to_terral: boolean): OpenItem => ({
  code, kind: code.startsWith('X') ? 'divergencia' : 'pendencia', text: 't', owner_public: 'Terral',
  due: null, due_text: null, effect: null, status: 'open', visible_to_terral,
})
const cm = (id: string, entity_kind: string, entity_ref: string, visible_to_terral: boolean): Comment => ({
  id, entity_kind, entity_ref, author_role: 'don', author_name: 'Equipe Don', body: 'b', visible_to_terral, created_at: '2026-11-01T00:00:00Z',
})

describe('toTerralData', () => {
  const p = realPlan()
  p.open_items.push(oi('P-90', true), oi('P-91', false), oi('X-90', false))
  p.dependencies.push(
    { id: 'd1', from_kind: 'open_item', from_ref: 'P-90', to_code: '3.1', suggested: false },
    { id: 'd2', from_kind: 'open_item', from_ref: 'P-91', to_code: '3.1', suggested: false },
    { id: 'd3', from_kind: 'open_item', from_ref: 'X-90', to_code: '3.1', suggested: false },
    { id: 'd4', from_kind: 'deliverable', from_ref: '3.1', to_code: 'I2', suggested: false },
  )
  p.comments.push(
    cm('c1', 'deliverable', '3.1', true),
    cm('c2', 'deliverable', '3.1', false),
    cm('c3', 'open_item', 'X-90', true),
    cm('c4', 'task', 't1', true),
    cm('c5', 'open_item', 'P-90', true),
  )
  p.evidence.push(
    { id: 'e1', entity_kind: 'decision', entity_ref: 'D01', storage_path: 'a', file_name: 'a', uploader_role: 'don', uploader_name: 'Equipe Don', visible_to_terral: true, created_at: '' },
    { id: 'e2', entity_kind: 'decision', entity_ref: 'D01', storage_path: 'b', file_name: 'b', uploader_role: 'don', uploader_name: 'Equipe Don', visible_to_terral: false, created_at: '' },
  )
  const t = toTerralData(p)

  it('has no Don-only keys', () => {
    for (const k of ['blocks', 'tasks', 'people', 'open_items_internal', 'to_schedule_plan', 'manual_risks', 'traceability'])
      expect(t).not.toHaveProperty(k)
  })

  it('drops X-items, hidden open items and their dependencies', () => {
    const codes = t.open_items.map((o) => o.code)
    expect(codes.filter((c) => c.startsWith('X-'))).toEqual([])
    expect(codes).toContain('P-90')
    expect(codes).not.toContain('P-91')
    for (const hidden of ['P-07', 'P-15', 'P-16', 'P-17']) expect(codes).not.toContain(hidden)
    expect(t.dependencies.map((d) => d.id)).toEqual(expect.arrayContaining(['d1', 'd4']))
    const leaked = t.dependencies.filter((d) => d.from_kind === 'open_item' && !codes.includes(d.from_ref))
    expect(leaked).toEqual([])
  })

  it('keeps only visible comments and evidence on Terral-visible entities', () => {
    expect(t.comments.map((c) => c.id)).toEqual(['c1', 'c5'])
    expect(t.evidence.map((e) => e.id)).toEqual(['e1'])
  })

  it('open items carry no banned words', () => {
    for (const o of t.open_items) expect(findBanned(`${o.text} ${o.effect ?? ''} ${o.owner_public}`), o.code).toEqual([])
  })
})
