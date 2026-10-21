// @vitest-environment node
// Proves through the public API (anon key + user sessions) that Terral never reaches Don-internal data.
// Runs only against a local stack (SUPABASE_URL on 127.0.0.1/localhost, from .env.local); skipped otherwise.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, anon, cleanup, EMAILS, extraRefs, ID, K, localStack, PATH, setup, SIGNUP_EMAIL, TERRAL_FILE, type Fixture } from './helpers/supa'

const DON_ONLY = ['person', 'task', 'block', 'to_schedule_plan', 'open_item_internal', 'traceability', 'manual_risk', 'history', 'comment_author', 'evidence_uploader']
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
  comment_author: ['comment_id', ID.commentVisible, { author_id: randomUUID() }],
  evidence_uploader: ['evidence_id', ID.evidenceVisible, { uploader_id: randomUUID() }],
}
const isUuid = (s: string) => /^[0-9a-f-]{36}$/.test(s)
/** Columns that would carry Don hours, Don people or internal owners. */
const INTERNAL_COLUMN = /(^|_)(hours?|load|person|lead|conducted|block)(_|$)|_h$|owner_raw|(author|uploader)_id$/

const rows = async (c: SupabaseClient, table: string) => {
  const r = await c.from(table).select('*')
  return r.data ?? [] // a permission error also means "reads nothing"
}

describe.skipIf(!localStack)('RLS: Terral never reaches Don data', () => {
  let f: Fixture
  let don: SupabaseClient, terral: SupabaseClient, terral2: SupabaseClient, pending: SupabaseClient, blocked: SupabaseClient
  const snapshot: Record<string, unknown> = {}

  beforeAll(async () => {
    f = await setup()
    ;({ don, terral, terral2, pending, blocked } = f.clients)
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

  it('Terral comments only as itself, only on Terral-visible entities; names and times are set by the server', async () => {
    const forged = { id: randomUUID(), created_at: '2000-01-01T00:00:00Z', author_name: 'Equipe Don' }
    const mine = { entity_kind: 'deliverable', entity_ref: K.deliverable, author_role: 'terral', body: 'ok', visible_to_terral: true }
    const ins = await terral.from('comment').insert({ ...mine, ...forged }).select('*').single()
    expect(ins.error).toBeNull()
    const id = ins.data!.id as string
    extraRefs.push(id)
    expect(id).not.toBe(forged.id)
    expect(Date.now() - Date.parse(ins.data!.created_at)).toBeLessThan(60_000)
    expect(ins.data!.author_name).toBe('terral') // the author's display_name, not the forged one

    // another Terral user sees who wrote it; a Don comment reads "Equipe Don"; no author ids anywhere
    const seen = (await terral2.from('comment').select('*').in('id', [id, ID.commentVisible])).data!
    expect(Object.fromEntries(seen.map((c) => [c.id, c.author_name]))).toEqual({ [id]: 'terral', [ID.commentVisible]: 'Equipe Don' })
    for (const c of seen) expect(Object.keys(c)).not.toContain('author_id')
    const embed = await terral.from('comment').select('id, comment_author(author_id)').eq('id', id)
    expect(embed.data?.[0]?.comment_author ?? null).toBeNull()

    // Don still knows the real author, through the Don-only side table
    expect((await don.from('comment').select('comment_author(author_id)').eq('id', id).single()).data).toEqual({ comment_author: { author_id: f.ids.terral } })
    const d = await don.from('comment').insert({ entity_kind: 'deliverable', entity_ref: K.deliverable, author_role: 'don', body: 'interno' }).select('id, author_name, visible_to_terral').single()
    extraRefs.push(d.data!.id)
    expect(d.data).toMatchObject({ author_name: 'Equipe Don', visible_to_terral: false })
    // the side row is written by an AFTER trigger: visible on the next read, not in the insert's own response
    expect((await don.from('comment_author').select('author_id').eq('comment_id', d.data!.id).single()).data).toEqual({ author_id: f.ids.don })
    expect((await don.from('comment_author').insert({ comment_id: d.data!.id, author_id: f.ids.terral })).error?.code).toBe('42501')
    // edits keep the attribution: Don can toggle visibility, not rename the author
    expect((await don.from('comment').update({ author_name: 'Beto', author_role: 'terral', visible_to_terral: true }).eq('id', d.data!.id).select('author_name, author_role, visible_to_terral').single()).data)
      .toEqual({ author_name: 'Equipe Don', author_role: 'don', visible_to_terral: true })

    const bad = [
      { entity_kind: 'open_item', entity_ref: K.openHidden },
      { entity_kind: 'task', entity_ref: ID.task },
      { author_role: 'don' },
      { visible_to_terral: false },
    ]
    for (const b of bad) expect((await terral.from('comment').insert({ ...mine, ...b })).error, JSON.stringify(b)).not.toBeNull()
    expect((await terral.from('comment').update({ body: 'edit' }).eq('id', id).select()).data).toEqual([])
    expect((await terral.from('comment').delete().eq('id', id).select()).data).toEqual([])
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
    const ev = { entity_kind: 'deliverable', entity_ref: K.deliverable, storage_path: own, file_name: 'a.pdf', uploader_role: 'terral', visible_to_terral: true }
    // a Terral evidence row cannot point at someone else's file (that would unlock it)
    expect((await store.download(PATH.orphan)).error).not.toBeNull()
    expect((await terral.from('evidence').insert({ ...ev, storage_path: PATH.orphan })).error?.code).toBe('42501')
    expect((await store.download(PATH.orphan)).error).not.toBeNull()
    expect((await terral.from('evidence').insert({ ...ev, entity_kind: 'open_item', entity_ref: K.openHidden })).error).not.toBeNull()
    expect((await terral.from('evidence').insert({ ...ev, uploader_role: 'don' })).error).not.toBeNull()
    const made = await terral.from('evidence').insert({ ...ev, uploader_name: 'Equipe Don', created_at: '2000-01-01T00:00:00Z' }).select('id, uploader_name, created_at').single()
    expect(made.error).toBeNull()
    extraRefs.push(made.data!.id)
    expect(made.data!.uploader_name).toBe('terral')
    expect(Date.now() - Date.parse(made.data!.created_at)).toBeLessThan(60_000)
    const seen = (await terral2.from('evidence').select('*').in('id', [made.data!.id, ID.evidenceVisible])).data!
    expect(Object.fromEntries(seen.map((e) => [e.id, e.uploader_name]))).toEqual({ [made.data!.id]: 'terral', [ID.evidenceVisible]: 'Equipe Don' })
    for (const e of seen) expect(Object.keys(e)).not.toContain('uploader_id')
    expect((await don.from('evidence').select('evidence_uploader(uploader_id)').eq('id', made.data!.id).single()).data).toEqual({ evidence_uploader: { uploader_id: f.ids.terral } })
    expect((await store.download(own)).error).toBeNull()
    expect((await store.download(PATH.hidden)).error).not.toBeNull()
  })

  it('Storage: Terral removes only its own orphan uploads (a file no evidence row uses)', async () => {
    const pdf = new Blob(['%PDF-1.4 orphan'], { type: 'application/pdf' })
    const store = terral.storage.from('evidence')
    const exists = async (path: string) => !(await admin().storage.from('evidence').download(path)).error

    // An upload whose evidence row never got written: the uploader can take it back.
    const orphan = `${f.ids.terral}/rls-orphan.pdf`
    expect((await store.upload(orphan, pdf, { contentType: 'application/pdf' })).error).toBeNull()
    expect((await terral2.storage.from('evidence').remove([orphan])).data ?? []).toEqual([]) // not someone else's
    expect((await terral2.storage.from('evidence').download(orphan)).error).not.toBeNull()
    expect((await store.download(orphan)).error).toBeNull() // the uploader still reads its own orphan
    expect(await exists(orphan)).toBe(true)
    expect((await store.remove([orphan])).data).toHaveLength(1)
    expect(await exists(orphan)).toBe(false)

    // A file an evidence row points at stays, even after Don hides the row from Terral.
    const used = `${f.ids.terral}/rls-used.pdf`
    expect((await store.upload(used, pdf, { contentType: 'application/pdf' })).error).toBeNull()
    const row = await terral.from('evidence')
      .insert({ entity_kind: 'deliverable', entity_ref: K.deliverable, storage_path: used, file_name: 'u.pdf', uploader_role: 'terral', visible_to_terral: true })
      .select('id').single()
    expect(row.error).toBeNull()
    extraRefs.push(row.data!.id)
    expect((await store.remove([used])).data ?? []).toEqual([])
    expect((await don.from('evidence').update({ visible_to_terral: false }).eq('id', row.data!.id)).error).toBeNull()
    expect((await store.remove([used])).data ?? []).toEqual([])
    expect(await exists(used)).toBe(true)
    expect((await store.remove([PATH.orphan])).data ?? []).toEqual([]) // Don's files: never
    expect(await exists(PATH.orphan)).toBe(true)
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

    // incomplete decisions are rejected; Terral cannot re-decide, Don can
    const decide = (c: SupabaseClient, args: Partial<Record<'p_outcome' | 'p_decided_by' | 'p_decided_at', string | null>>) =>
      c.rpc('record_decision', { p_code: K.decision, p_outcome: 'novo', p_decided_by: 'Diretoria', p_decided_at: '2026-10-28', ...args })
    for (const bad of [{ p_outcome: null }, { p_outcome: '  ' }, { p_decided_by: null }, { p_decided_by: '' }, { p_decided_at: null }])
      for (const c of [terral, don]) expect((await decide(c, bad)).error?.code, JSON.stringify(bad)).toBe('22023')
    expect((await decide(terral, {})).error?.code).toBe('42501')
    expect((await don.from('decision').select('outcome').eq('code', K.decision).single()).data!.outcome).toBe('ok')
    expect((await decide(don, { p_outcome: 'revisto' })).error).toBeNull()
    expect((await don.from('decision').select('outcome').eq('code', K.decision).single()).data!.outcome).toBe('revisto')
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

  it('profiles carry the sign-up e-mail and date (Acessos never approves blind); Terral reads only its own', async () => {
    const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
    const users = data.users.filter((u) => u.email?.endsWith('@x.test'))
    const profs = (await don.from('profiles').select('id, email, created_at')).data ?? []
    for (const u of users) {
      const p = profs.find((x) => x.id === u.id)
      expect(p, u.email).toBeDefined()
      expect(p!.email).toBe(u.email)
      expect(Math.abs(new Date(p!.created_at).getTime() - new Date(u.created_at).getTime())).toBeLessThan(1000)
    }
    expect((await terral.from('profiles').select('id, email')).data).toEqual([{ id: f.ids.terral, email: EMAILS.terral }])
    expect((await terral.from('profiles').select('email').eq('id', f.ids.don)).data).toEqual([])
    expect((await pending.from('profiles').select('email')).data).toEqual([{ email: EMAILS.pending }])
  })

  it('profiles: a Don never changes their own role or status, but changes another Don', async () => {
    for (const patch of [{ status: 'blocked' }, { role: 'terral' }, { status: 'pending' }]) {
      const r = await don.from('profiles').update(patch).eq('id', f.ids.don).select()
      expect(r.error?.code, JSON.stringify(patch)).toBe('42501')
    }
    expect((await admin().from('profiles').select('role, status').eq('id', f.ids.don).single()).data).toEqual({ role: 'don', status: 'approved' })
    // the own person link and the password flag RPC still work
    expect((await don.from('profiles').update({ person_id: K.person }).eq('id', f.ids.don).select()).error).toBeNull()
    expect((await don.rpc('clear_must_change_password')).error).toBeNull()

    // another Don (the "blocked" fixture, promoted for this test) can be blocked and unblocked by Don
    const a = admin()
    expect((await a.from('profiles').update({ role: 'don', status: 'approved' }).eq('id', f.ids.blocked)).error).toBeNull() // service role passes
    expect((await don.from('profiles').update({ status: 'blocked' }).eq('id', f.ids.blocked).select()).data).toHaveLength(1)
    expect((await don.from('profiles').update({ role: 'terral' }).eq('id', f.ids.blocked).select()).data).toHaveLength(1)
    expect((await a.from('profiles').select('role, status').eq('id', f.ids.blocked).single()).data).toEqual({ role: 'terral', status: 'blocked' })
    await a.from('profiles').update({ person_id: null }).eq('id', f.ids.don)
  })

  it('open items are resolved or hidden, never deleted (a delete would leak its code over Realtime)', async () => {
    expect((await don.from('open_item').delete().eq('code', K.openHidden).select()).data ?? []).toEqual([])
    expect((await don.from('open_item').select('code').eq('code', K.openHidden)).data).toHaveLength(1)
    expect((await don.from('open_item').update({ status: 'resolved' }).eq('code', K.openHidden).select('status')).data).toEqual([{ status: 'resolved' }])
    await don.from('open_item').update({ status: 'open' }).eq('code', K.openHidden)
  })

  it('profile changes are audited, with no secret in the history row', async () => {
    expect((await don.from('profiles').update({ status: 'approved', role: 'terral' }).eq('id', f.ids.pending).select()).data).toHaveLength(1)
    const h = (await don.from('history').select('*').eq('table_name', 'profiles').eq('row_ref', f.ids.pending).eq('action', 'UPDATE')).data!
    const last = h.find((r) => r.new.status === 'approved')
    expect(last).toMatchObject({ user_id: f.ids.don, old: { status: 'pending', role: null }, new: { role: 'terral' } })
    expect(Object.keys(last.new).sort()).toEqual(['created_at', 'display_name', 'email', 'id', 'must_change_password', 'person_id', 'role', 'status']) // e-mail and date: Don reads them anyway (0010)
    await admin().from('profiles').update({ status: 'pending', role: null }).eq('id', f.ids.pending)
  })

  it('nobody can take the name "Equipe Don" (Don authors appear to Terral under it)', async () => {
    const reserved = ['Equipe Don', 'equipe  don', ' EQUIPE DON ', 'Equipe D\u00f4n', '\u00c9quipe-Don', 'EquipeDon', 'equipe\u00a0don', 'equipe\u200bdon', 'Minha Equipe Don oficial',
      // inside a word: zero-width space, soft hyphen, word joiner, BOM, bidi override, fullwidth letter, combining accents
      'Equipe D\u200bon', 'Equipe D\u00adon', 'Equi\u2060pe Don', 'Equipe\ufeffDon', '\u202eEquipe Don', 'Equipe \uff24on', 'Equipe Do\u0301n', 'E\u0301quipe Do\u0300n',
      // invisible marks and fillers outside the ranges 0006 listed
      'Equipe D\u{1D173}on', 'Equipe D\u{1BCA0}on', 'Equipe D\u3164on', 'Equipe D\u093Con']
    for (const [i, display_name] of reserved.entries()) {
      const s = await anon().auth.signUp({ email: `reserved-${i}@x.test`, password: 'rls-test-password-1', options: { data: { display_name } } })
      expect(s.error, JSON.stringify(display_name)).not.toBeNull()
    }
    // the e-mail fallback is checked too
    expect((await anon().auth.signUp({ email: 'equipe.don@x.test', password: 'rls-test-password-1' })).error).not.toBeNull()
    const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
    expect(data.users.filter((u) => /^(reserved-\d+|equipe\.don)@x\.test$/.test(u.email ?? ''))).toEqual([])

    // a rename is refused as well, even by Don
    expect((await don.from('profiles').update({ display_name: 'equipe don' }).eq('id', f.ids.terral)).error?.code).toBe('23514')
    expect((await admin().from('profiles').select('display_name').eq('id', f.ids.terral).single()).data).toEqual({ display_name: 'terral' })

    // names that only look alike stay allowed
    const ok = await anon().auth.signUp({ email: 'donizete@x.test', password: 'rls-test-password-1', options: { data: { display_name: 'Equipe Donizete' } } })
    expect(ok.error).toBeNull()
    extraRefs.push(ok.data.user!.id)
  })

  it('only the service role can reset the domain tables', async () => {
    for (const c of [don, terral, pending, anon()]) expect((await c.rpc('reset_domain')).error, 'reset_domain').not.toBeNull()
    expect((await don.from('deliverable').select('code').eq('code', K.deliverable)).data).toHaveLength(1)
  })

  it('a divergência (X-item) can never be made visible to Terral', async () => {
    expect((await don.from('open_item').update({ visible_to_terral: true }).eq('code', K.openHidden)).error?.code).toBe('23514')
    const x = { code: 'rls-X-99', kind: 'divergencia', text: 'x', owner_public: 'Equipe Don', status: 'open', visible_to_terral: true }
    expect((await don.from('open_item').insert(x)).error?.code).toBe('23514')
    expect((await admin().from('open_item').insert(x)).error?.code).toBe('23514') // not even the loader
    expect((await don.from('open_item').select('visible_to_terral').eq('code', K.openHidden).single()).data).toEqual({ visible_to_terral: false })
  })

  it('length limits hold at the database too (0011): comment 2000, file name 200, display name 80', async () => {
    const c = { entity_kind: 'deliverable', entity_ref: K.deliverable, author_role: 'don', visible_to_terral: false }
    expect((await don.from('comment').insert({ ...c, body: 'a'.repeat(2001) })).error?.code).toBe('23514')
    const e = { entity_kind: 'deliverable', entity_ref: K.deliverable, storage_path: PATH.orphan, uploader_role: 'don', visible_to_terral: false }
    expect((await don.from('evidence').insert({ ...e, file_name: `${'a'.repeat(197)}.pdf` })).error?.code).toBe('23514')
    expect((await don.from('profiles').update({ display_name: 'a'.repeat(81) }).eq('id', f.ids.terral)).error?.code).toBe('23514')
    expect((await admin().from('profiles').select('display_name').eq('id', f.ids.terral).single()).data).toEqual({ display_name: 'terral' })
  })

  it('set_must_change_password logs the Don who asked; nobody but the service role may call it (new functions are not public)', async () => {
    for (const c of [don, terral, pending, anon()])
      expect((await c.rpc('set_must_change_password', { p_id: f.ids.terral, p_value: true, p_by: f.ids.don })).error?.code).toBe('42501')
    expect((await admin().rpc('set_must_change_password', { p_id: f.ids.terral, p_value: true, p_by: f.ids.don })).error).toBeNull()
    const h = (await don.from('history').select('*').eq('table_name', 'profiles').eq('row_ref', f.ids.terral).eq('action', 'UPDATE').order('id', { ascending: false }).limit(1)).data!
    expect(h[0]).toMatchObject({ user_id: f.ids.don, old: { must_change_password: false }, new: { must_change_password: true } })
    expect((await admin().rpc('set_must_change_password', { p_id: randomUUID(), p_value: true, p_by: f.ids.don })).error?.code).toBe('P0002')
    await admin().from('profiles').update({ must_change_password: false }).eq('id', f.ids.terral)
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
