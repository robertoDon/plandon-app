// @vitest-environment node
// Proves through the public API (anon key + user sessions) that Terral never reaches Don-internal data.
// Runs only against a local stack (SUPABASE_URL on 127.0.0.1/localhost, from .env.local); skipped otherwise.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, anon, cleanup, extraRefs, ID, K, localStack, PATH, setup, SIGNUP_EMAIL, TERRAL_FILE, type Fixture } from './helpers/supa'

const DON_ONLY = ['person', 'task', 'block', 'to_schedule_plan', 'open_item_internal', 'traceability', 'manual_risk', 'history']
const SHARED = ['deliverable', 'ritual', 'ritual_occurrence', 'decision', 'to_schedule', 'open_item', 'goal', 'dependency', 'comment', 'evidence']
const ALL = [...DON_ONLY, ...SHARED, 'profiles']

/** table -> [primary key column, fixture key, harmless patch] */
const ROW: Record<string, [string, string, Record<string, unknown>]> = {
  person: ['id', K.person, { name: 'x' }],
  task: ['id', ID.task, { description: 'x' }],
  block: ['id', ID.block, { done: true }],
  to_schedule_plan: ['to_schedule_id', K.toSchedule, { hours: 1 }],
  open_item_internal: ['code', K.openHidden, { owner_raw: 'x' }],
  traceability: ['id', ID.trace, { field: 'x' }],
  manual_risk: ['id', ID.risk, { note: 'x' }],
  deliverable: ['code', K.deliverable, { name: 'x', in_use_start: '2026-01-01' }],
  ritual: ['id', ID.ritual, { name: 'x' }],
  ritual_occurrence: ['id', ID.occurrence, { week: 'x' }],
  decision: ['code', K.decision, { title: 'x', status: 'decided' }],
  to_schedule: ['id', K.toSchedule, { what: 'x', confirmed_date: '2026-01-01' }],
  open_item: ['code', K.openVisible, { text: 'x', visible_to_terral: false }],
  goal: ['id', ID.goal, { metric: 'x' }],
  dependency: ['id', ID.depDecision, { suggested: true }],
  comment: ['id', ID.commentVisible, { body: 'x' }],
  evidence: ['id', ID.evidenceVisible, { file_name: 'x' }],
}
const isUuid = (s: string) => /^[0-9a-f-]{36}$/.test(s)
/** Columns that would carry Don hours, Don people or internal owners. */
const INTERNAL_COLUMN = /(^|_)(hours?|load|person|lead|conducted)(_|$)|_h$|owner_raw/

const rows = async (c: SupabaseClient, table: string) => {
  const r = await c.from(table).select('*')
  return r.data ?? [] // a permission error also means "reads nothing"
}

describe.skipIf(!localStack)('RLS: Terral never reaches Don data', () => {
  let f: Fixture
  let don: SupabaseClient, terral: SupabaseClient, pending: SupabaseClient, blocked: SupabaseClient
  const snapshot: Record<string, unknown> = {}

  beforeAll(async () => {
    f = await setup()
    ;({ don, terral, pending, blocked } = f.clients)
    for (const [t, [pk, key]] of Object.entries(ROW)) snapshot[t] = (await don.from(t).select('*').eq(pk, key).single()).data
  }, 60_000)
  afterAll(async () => {
    if (f) await cleanup()
  }, 60_000)

  it('Don reads every table (positive control)', async () => {
    for (const t of ALL) expect((await rows(don, t)).length, t).toBeGreaterThan(0)
    expect((await don.from('open_item').select('code').eq('code', K.openHidden)).data).toHaveLength(1)
  })

  it('Terral reads no row of any Don-only table', async () => {
    for (const t of DON_ONLY) expect(await rows(terral, t), t).toEqual([])
  })

  it('Terral reads the shared tables, without hours or Don people columns', async () => {
    for (const t of SHARED) {
      const data = await rows(terral, t)
      expect(data.length, t).toBeGreaterThan(0)
      for (const col of Object.keys(data[0])) expect(col, `${t}.${col}`).not.toMatch(INTERNAL_COLUMN)
    }
    expect(Object.keys((await terral.from('deliverable').select('*').limit(1)).data![0])).not.toContain('hours')
  })

  it('Terral never sees Don-only open items, their dependencies, comments or evidence', async () => {
    const codes = (await terral.from('open_item').select('code')).data!.map((r) => r.code)
    expect(codes).toContain(K.openVisible)
    expect(codes).not.toContain(K.openHidden)
    expect(codes.every((c: string) => !c.startsWith('X-') && !c.startsWith('rls-X-'))).toBe(true)

    const deps = (await terral.from('dependency').select('id')).data!.map((r) => r.id)
    expect(deps).toEqual(expect.arrayContaining([ID.depDecision, ID.depOpenVisible]))
    expect(deps).not.toContain(ID.depOpenHidden)

    const comments = (await terral.from('comment').select('id')).data!.map((r) => r.id)
    expect(comments).toContain(ID.commentVisible)
    for (const id of [ID.commentHidden, ID.commentOnHiddenItem, ID.commentOnTask]) expect(comments).not.toContain(id)

    const evidence = (await terral.from('evidence').select('id')).data!.map((r) => r.id)
    expect(evidence).toContain(ID.evidenceVisible)
    for (const id of [ID.evidenceHidden, ID.evidenceOnHiddenItem]) expect(evidence).not.toContain(id)
  })

  it('Terral cannot insert, update or delete any table except its own comments and evidence', async () => {
    for (const [t, [pk, key, patch]] of Object.entries(ROW)) {
      const copy: Record<string, unknown> = { ...(snapshot[t] as object), [pk]: isUuid(key) ? randomUUID() : `rls-new-${t}` }
      const ins = await terral.from(t).insert(copy).select()
      expect(ins.error?.code, `insert ${t}`).toBe('42501')
      expect((await terral.from(t).update(patch).eq(pk, key).select()).data ?? [], `update ${t}`).toEqual([])
      expect((await terral.from(t).delete().eq(pk, key).select()).data ?? [], `delete ${t}`).toEqual([])
    }
    // nothing changed underneath
    for (const [t, [pk, key]] of Object.entries(ROW)) expect((await don.from(t).select('*').eq(pk, key).single()).data, t).toEqual(snapshot[t])
    expect((await terral.from('deliverable').update({ name: 'x' }).eq('code', K.deliverable).select()).data).toEqual([])
  })

  it('Terral comments only as itself, only on Terral-visible entities', async () => {
    const mine = { id: randomUUID(), entity_kind: 'deliverable', entity_ref: K.deliverable, author_id: f.ids.terral, author_role: 'terral', body: 'ok', visible_to_terral: true }
    extraRefs.push(mine.id)
    expect((await terral.from('comment').insert(mine)).error).toBeNull()
    expect((await terral.from('comment').select('id').eq('id', mine.id)).data).toHaveLength(1)
    const bad = [
      { entity_kind: 'open_item', entity_ref: K.openHidden },
      { entity_kind: 'task', entity_ref: ID.task },
      { author_role: 'don' },
      { author_id: f.ids.don },
      { visible_to_terral: false },
    ]
    for (const b of bad) expect((await terral.from('comment').insert({ ...mine, id: randomUUID(), ...b })).error, JSON.stringify(b)).not.toBeNull()
    expect((await terral.from('comment').update({ body: 'edit' }).eq('id', mine.id).select()).data).toEqual([])
    expect((await terral.from('comment').delete().eq('id', mine.id).select()).data).toEqual([])
  })

  it('Storage: Terral reads only files of Terral-visible evidence and uploads only into its own folder', async () => {
    const bucket = (await admin().storage.getBucket('evidence')).data!
    expect(bucket.public).toBe(false)
    expect(bucket.file_size_limit).toBe(25 * 1024 * 1024)
    expect([...bucket.allowed_mime_types!].sort()).toEqual([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp',
    ])

    const store = terral.storage.from('evidence')
    expect((await store.download(PATH.visible)).error).toBeNull()
    expect((await store.download(PATH.hidden)).error).not.toBeNull()
    expect((await store.download(PATH.onHiddenItem)).error).not.toBeNull()
    expect((await don.storage.from('evidence').download(PATH.hidden)).error).toBeNull()
    for (const c of [pending, blocked, anon()]) expect((await c.storage.from('evidence').download(PATH.visible)).error).not.toBeNull()

    const pdf = new Blob(['%PDF-1.4 terral'], { type: 'application/pdf' })
    expect((await store.upload(`rls/${TERRAL_FILE}`, pdf, { contentType: 'application/pdf' })).error).not.toBeNull()
    expect((await store.upload(`${f.ids.terral}/x.txt`, new Blob(['x'], { type: 'text/plain' }), { contentType: 'text/plain' })).error).not.toBeNull()
    expect((await store.upload(PATH.hidden, pdf, { contentType: 'application/pdf', upsert: true })).error).not.toBeNull()
    expect((await store.remove([PATH.visible])).data ?? []).toEqual([])
    expect((await don.storage.from('evidence').download(PATH.visible)).error).toBeNull()

    const own = `${f.ids.terral}/${TERRAL_FILE}`
    expect((await store.upload(own, pdf, { contentType: 'application/pdf' })).error).toBeNull()
    const ev = { id: randomUUID(), entity_kind: 'deliverable', entity_ref: K.deliverable, storage_path: own, file_name: 'a.pdf', uploader_id: f.ids.terral, uploader_role: 'terral', visible_to_terral: true }
    extraRefs.push(ev.id)
    // a Terral evidence row cannot point at someone else's file (that would unlock it)
    expect((await store.download(PATH.orphan)).error).not.toBeNull()
    expect((await terral.from('evidence').insert({ ...ev, id: randomUUID(), storage_path: PATH.orphan })).error?.code).toBe('42501')
    expect((await store.download(PATH.orphan)).error).not.toBeNull()
    expect((await terral.from('evidence').insert({ ...ev, id: randomUUID(), entity_kind: 'open_item', entity_ref: K.openHidden })).error).not.toBeNull()
    expect((await terral.from('evidence').insert({ ...ev, id: randomUUID(), uploader_role: 'don' })).error).not.toBeNull()
    expect((await terral.from('evidence').insert(ev)).error).toBeNull()
    expect((await store.download(own)).error).toBeNull()
    expect((await store.download(PATH.hidden)).error).not.toBeNull()
  })

  it('confirm_date and record_decision work for Terral and Don with only their effects', async () => {
    expect(
      (await terral.rpc('record_decision', { p_code: K.decision, p_outcome: 'ok', p_decided_by: 'Diretoria', p_decided_at: '2026-10-27' })).error,
    ).toBeNull()
    const d = (await don.from('decision').select('*').eq('code', K.decision).single()).data!
    expect(d).toMatchObject({ status: 'decided', outcome: 'ok', decided_by: 'Diretoria', decided_at: '2026-10-27', title: 'Decisão teste' })

    expect((await terral.rpc('confirm_date', { p_kind: 'deliverable', p_ref: K.deliverable, p_date: '2026-11-20' })).error).toBeNull()
    const del = (await don.from('deliverable').select('*').eq('code', K.deliverable).single()).data!
    expect(del).toMatchObject({ in_use_start: '2026-11-20', in_use_end: '2026-11-20', in_use_confirmed: true, in_use_at: null, built_at: null, in_use_text: '23 e 24/11/2026' })

    expect((await terral.rpc('confirm_date', { p_kind: 'to_schedule', p_ref: K.toSchedule, p_date: '2026-11-12' })).error).toBeNull()
    expect((await don.from('to_schedule').select('confirmed_date').eq('id', K.toSchedule).single()).data!.confirmed_date).toBe('2026-11-12')

    expect((await terral.rpc('confirm_date', { p_kind: 'block', p_ref: ID.block, p_date: '2026-11-12' })).error).not.toBeNull()
    expect((await terral.rpc('confirm_date', { p_kind: 'deliverable', p_ref: 'nope', p_date: '2026-11-12' })).error).not.toBeNull()
    expect((await terral.rpc('record_decision', { p_code: 'nope', p_outcome: 'x', p_decided_by: 'x', p_decided_at: '2026-10-27' })).error).not.toBeNull()

    expect((await don.rpc('record_decision', { p_code: K.decision, p_outcome: 'revisto', p_decided_by: 'Diretoria', p_decided_at: '2026-10-28' })).error).toBeNull()
    expect((await don.rpc('confirm_date', { p_kind: 'deliverable', p_ref: K.deliverable, p_date: '2026-11-21' })).error).toBeNull()

    // the RPC writes are logged under the caller, not hidden behind security definer
    const h = (await don.from('history').select('user_id, action').eq('row_ref', K.decision).eq('table_name', 'decision')).data!
    expect(h).toEqual(expect.arrayContaining([{ user_id: f.ids.terral, action: 'UPDATE' }, { user_id: f.ids.don, action: 'UPDATE' }]))
  })

  it('pending, blocked and anonymous users read nothing and cannot call the RPCs', async () => {
    const nobody = anon()
    for (const c of [pending, blocked, nobody]) {
      for (const t of [...DON_ONLY, ...SHARED]) expect(await rows(c, t), t).toEqual([])
      expect((await c.rpc('record_decision', { p_code: K.decision, p_outcome: 'x', p_decided_by: 'x', p_decided_at: '2026-10-27' })).error).not.toBeNull()
      expect((await c.rpc('confirm_date', { p_kind: 'deliverable', p_ref: K.deliverable, p_date: '2026-11-01' })).error).not.toBeNull()
      expect((await c.rpc('clear_must_change_password')).error).not.toBeNull()
    }
    expect(await rows(nobody, 'profiles')).toEqual([])
    // pending/blocked still see their own profile (the "aguardando liberação" screen needs it)
    expect((await rows(pending, 'profiles')).map((p) => p.id)).toEqual([f.ids.pending])
    expect((await rows(blocked, 'profiles')).map((p) => p.id)).toEqual([f.ids.blocked])
  })

  it('profiles: own row only, no self-escalation, flag cleared only by RPC, Don administers', async () => {
    expect((await rows(terral, 'profiles')).map((p) => p.id)).toEqual([f.ids.terral])
    for (const c of [terral, pending, blocked]) {
      const { data: me } = await c.auth.getUser()
      for (const patch of [{ role: 'don' }, { status: 'approved' }, { person_id: K.person }, { must_change_password: false }, { display_name: 'x' }])
        expect((await c.from('profiles').update(patch).eq('id', me.user!.id).select()).data ?? [], JSON.stringify(patch)).toEqual([])
      expect((await c.from('profiles').insert({ id: randomUUID(), display_name: 'x', role: 'don', status: 'approved' })).error).not.toBeNull()
    }
    expect((await admin().from('profiles').select('role, status').eq('id', f.ids.terral).single()).data).toEqual({ role: 'terral', status: 'approved' })

    await admin().from('profiles').update({ must_change_password: true }).eq('id', f.ids.terral)
    expect((await terral.rpc('clear_must_change_password')).error).toBeNull()
    expect((await admin().from('profiles').select('must_change_password').eq('id', f.ids.terral).single()).data!.must_change_password).toBe(false)

    expect((await don.from('profiles').update({ person_id: K.person }).eq('id', f.ids.pending).select()).data).toHaveLength(1)

    // public signup: metadata cannot grant a role, the account starts pending
    const s = await anon().auth.signUp({ email: SIGNUP_EMAIL, password: 'rls-test-password-1', options: { data: { display_name: 'Nova Pessoa', role: 'don', status: 'approved' } } })
    expect(s.error).toBeNull()
    expect((await admin().from('profiles').select('display_name, role, status, must_change_password').eq('id', s.data.user!.id).single()).data).toEqual({
      display_name: 'Nova Pessoa', role: null, status: 'pending', must_change_password: false,
    })
  })

  it('history logs Don edits and nobody can read or rewrite it except Don reading', async () => {
    expect((await don.from('deliverable').update({ name: 'Novo' }).eq('code', K.deliverable).select()).data).toHaveLength(1)
    const h = (await don.from('history').select('*').eq('row_ref', K.deliverable).eq('action', 'UPDATE').eq('user_id', f.ids.don)).data!
    expect(h.some((r) => r.table_name === 'deliverable' && r.new.name === 'Novo' && r.old.name !== 'Novo')).toBe(true)

    expect(await rows(terral, 'history')).toEqual([])
    const count = async () => (await don.from('history').select('id').eq('row_ref', K.deliverable)).data!.length
    const before = await count()
    for (const c of [don, terral]) {
      expect((await c.from('history').update({ action: 'x' }).eq('row_ref', K.deliverable).select()).data ?? []).toEqual([])
      expect((await c.from('history').delete().eq('row_ref', K.deliverable).select()).data ?? []).toEqual([])
      expect((await c.from('history').insert({ table_name: 'deliverable', row_ref: 'rls-fake', action: 'INSERT' })).error?.code).toBe('42501')
    }
    expect(await count()).toBe(before)
  })
})
