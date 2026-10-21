import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

export const url = process.env.SUPABASE_URL ?? ''
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/** Fixtures create and delete auth users: only ever run against a local stack, never prod. */
export const localStack = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) && !!anonKey && !!serviceKey

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
export const admin = (): SupabaseClient => createClient(url, serviceKey, opts)
export const anon = (): SupabaseClient => createClient(url, anonKey, opts)

const PASSWORD = 'rls-test-password-1'
export const EMAILS = { don: 'don@x.test', terral: 'terral@x.test', terral2: 'terral2@x.test', pending: 'pending@x.test', blocked: 'blocked@x.test' } as const
/** Created by the test through public signup. */
export const SIGNUP_EMAIL = 'signup@x.test'
type Who = keyof typeof EMAILS

// Every fixture key starts with "rls-" so it never collides with imported data (codes 3.1, D01, X-04 ...).
export const K = {
  person: 'rls-p',
  deliverable: 'rls-3.1',
  decision: 'rls-D01',
  toSchedule: 'rls-3.1-1',
  openVisible: 'rls-P-01',
  openHidden: 'rls-X-04', // a divergência: Don-only
}
export const ID = {
  task: randomUUID(),
  block: randomUUID(),
  ritual: randomUUID(),
  occurrence: randomUUID(),
  goal: randomUUID(),
  trace: randomUUID(),
  risk: randomUUID(),
  depDecision: randomUUID(),
  depOpenVisible: randomUUID(),
  depOpenHidden: randomUUID(),
  commentVisible: randomUUID(),
  commentHidden: randomUUID(),
  commentOnHiddenItem: randomUUID(),
  commentOnTask: randomUUID(),
  evidenceVisible: randomUUID(),
  evidenceHidden: randomUUID(),
  evidenceOnHiddenItem: randomUUID(),
}
export const PATH = {
  visible: `rls/${ID.evidenceVisible}.pdf`,
  hidden: `rls/${ID.evidenceHidden}.pdf`,
  onHiddenItem: `rls/${ID.evidenceOnHiddenItem}.pdf`,
  orphan: `rls/orphan.pdf`, // a Don file with no evidence row yet
}

export type Fixture = { ids: Record<Who, string>; clients: Record<Who, SupabaseClient> }

const ok = <T extends { error: unknown }>(r: T, what: string): T => {
  if (r.error) throw new Error(`${what}: ${JSON.stringify(r.error)}`)
  return r
}

/** Ids of rows the test itself creates (Terral comments, evidence): their history goes too. */
export const extraRefs: string[] = []

/** File name Terral uploads under its own "<uid>/" folder in the test. */
export const TERRAL_FILE = 'rls-terral.pdf'
/** More files Terral uploads under its own folder (orphan cleanup test). */
export const TERRAL_FILES = [TERRAL_FILE, 'rls-orphan.pdf', 'rls-used.pdf']

/** Removes every fixture row, file, user and the history they produced. Safe to run twice. */
export async function cleanup() {
  const a = admin()
  const del = async (table: string, col: string, values: string[]) => ok(await a.from(table).delete().in(col, values), `cleanup ${table}`)
  const { data } = ok(await a.auth.admin.listUsers({ perPage: 1000 }), 'listUsers')
  const users = data.users.filter((u) => u.email?.endsWith('@x.test')) // every fixture and test signup uses @x.test
  await a.storage.from('evidence').remove([...Object.values(PATH), ...users.flatMap((u) => TERRAL_FILES.map((n) => `${u.id}/${n}`))])
  await del('evidence', 'entity_ref', [K.deliverable, K.openHidden, ID.task])
  await del('comment', 'entity_ref', [K.deliverable, K.openHidden, ID.task, K.decision])
  await del('dependency', 'to_code', [K.deliverable])
  await del('manual_risk', 'id', [ID.risk])
  await del('traceability', 'id', [ID.trace])
  await del('goal', 'id', [ID.goal])
  await del('ritual_occurrence', 'id', [ID.occurrence])
  await del('ritual', 'id', [ID.ritual])
  await del('block', 'id', [ID.block])
  await del('task', 'id', [ID.task])
  await del('to_schedule_plan', 'to_schedule_id', [K.toSchedule])
  await del('to_schedule', 'id', [K.toSchedule])
  await del('open_item_internal', 'code', [K.openVisible, K.openHidden])
  await del('open_item', 'code', [K.openVisible, K.openHidden])
  await del('decision', 'code', [K.decision])
  await del('deliverable', 'code', [K.deliverable])
  await del('person', 'id', [K.person])
  for (const u of users) ok(await a.auth.admin.deleteUser(u.id), 'deleteUser')
  const refs = [...Object.values(K), ...Object.values(ID), ...extraRefs, ...users.map((u) => u.id)] // user id = profiles row_ref
  ok(await a.from('history').delete().in('row_ref', refs), 'cleanup history')
}

async function signIn(email: string): Promise<SupabaseClient> {
  const c = anon()
  ok(await c.auth.signInWithPassword({ email, password: PASSWORD }), `signIn ${email}`)
  return c
}

export async function setup(): Promise<Fixture> {
  await cleanup()
  const a = admin()
  const ids = {} as Record<Who, string>
  for (const who of Object.keys(EMAILS) as Who[]) {
    const { data } = ok(
      await a.auth.admin.createUser({ email: EMAILS[who], password: PASSWORD, email_confirm: true, user_metadata: { display_name: who } }),
      `createUser ${who}`,
    )
    ids[who] = data.user!.id
  }
  const profile = (id: string, p: object) => a.from('profiles').update(p).eq('id', id)
  ok(await profile(ids.don, { role: 'don', status: 'approved' }), 'profile don')
  ok(await profile(ids.terral, { role: 'terral', status: 'approved' }), 'profile terral')
  ok(await profile(ids.terral2, { role: 'terral', status: 'approved' }), 'profile terral2')
  ok(await profile(ids.blocked, { role: 'terral', status: 'blocked' }), 'profile blocked')
  // pending keeps the signup trigger defaults

  const ins = async (table: string, rows: object | object[]) => ok(await a.from(table).insert(rows), `insert ${table}`)
  await ins('person', { id: K.person, name: 'Pessoa Teste', net_capacity_h: 100, reserved_h: 4, daily_cap_h: 8, weekly_cap_h: 40 })
  await ins('deliverable', {
    code: K.deliverable, name: 'Entrega teste', front: 'Gestão', origin: 'escopo2', built_date: '2026-11-10',
    in_use_start: '2026-11-23', in_use_end: '2026-11-24', in_use_text: '23 e 24/11/2026', in_use_confirmed: false,
    target_ritual: 'Reunião de resultado', terral_owner: 'Diretoria', published_flag: null, sort: 1,
  })
  await ins('decision', { code: K.decision, title: 'Decisão teste', date: '2026-10-27', prepared_on: '2026-10-20', status: 'pending' })
  await ins('to_schedule', { id: K.toSchedule, code: K.deliverable, what: 'Treinamento', window_start: '2026-11-01', window_end: '2026-11-30', window_text: 'novembro' })
  await ins('to_schedule_plan', { to_schedule_id: K.toSchedule, person_id: K.person, hours: 8 })
  await ins('open_item', [
    { code: K.openVisible, kind: 'pendencia', text: 'Pendência visível', owner_public: 'Terral', status: 'open', visible_to_terral: true },
    { code: K.openHidden, kind: 'divergencia', text: 'Preço da Don', owner_public: 'Equipe Don', status: 'open', visible_to_terral: false },
  ])
  await ins('open_item_internal', [{ code: K.openVisible, owner_raw: 'Terral' }, { code: K.openHidden, owner_raw: 'Beto' }])
  await ins('task', { id: ID.task, sort: 1, due: '2026-11-10', kind: 'task', front: 'Gestão', code: K.deliverable, description: 'Tarefa teste', person_id: K.person, status: 'not_started' })
  await ins('block', { id: ID.block, date: '2026-11-03', week: 'S03', type: 'Rito', front: 'Gestão', code: null, description: 'Rito teste', person_id: K.person, hours: 2, due: null, task_id: ID.task })
  await ins('ritual', { id: ID.ritual, name: 'Rito teste', cadence: 'semanal', first_date: '2026-11-03', last_date: '2026-12-15', sort: 1 })
  await ins('ritual_occurrence', { id: ID.occurrence, ritual_id: ID.ritual, date: '2026-11-03', week: 'S03' })
  await ins('goal', { id: ID.goal, sort: 1, level: 'Grupo', position: 'Norte', metric: 'Receita', baseline: null, state: 'definida', target: null })
  await ins('traceability', { id: ID.trace, annex_tab: 'A1', field: 'campo', col: 'B', n: 1, deliverable_code: K.deliverable, task_description: 'Tarefa teste', filled_by: 'Beto' })
  await ins('dependency', [
    { id: ID.depDecision, from_kind: 'decision', from_ref: K.decision, to_code: K.deliverable, suggested: false },
    { id: ID.depOpenVisible, from_kind: 'open_item', from_ref: K.openVisible, to_code: K.deliverable, suggested: true },
    { id: ID.depOpenHidden, from_kind: 'open_item', from_ref: K.openHidden, to_code: K.deliverable, suggested: true },
  ])
  await ins('manual_risk', { id: ID.risk, title: 'Risco teste', severity: 'high', links: [K.deliverable], person_id: K.person, status: 'open', note: 'interno', created_by: ids.don })
  const comment = (id: string, entity_kind: string, entity_ref: string, visible_to_terral: boolean) =>
    ({ id, entity_kind, entity_ref, author_role: 'don', author_name: 'Beto', body: `comentário ${id}`, visible_to_terral }) // name is overwritten
  await ins('comment', [
    comment(ID.commentVisible, 'deliverable', K.deliverable, true),
    comment(ID.commentHidden, 'deliverable', K.deliverable, false),
    comment(ID.commentOnHiddenItem, 'open_item', K.openHidden, true), // flag says visible, target is Don-only
    comment(ID.commentOnTask, 'task', ID.task, true), // tasks are Don-only
  ])
  // service-role inserts have no auth.uid(): attribution rows are written by hand here, by the trigger in the app
  await ins('comment_author', [ID.commentVisible, ID.commentHidden, ID.commentOnHiddenItem, ID.commentOnTask].map((comment_id) => ({ comment_id, author_id: ids.don })))
  const pdf = new Blob(['%PDF-1.4 rls'], { type: 'application/pdf' })
  for (const p of Object.values(PATH)) ok(await a.storage.from('evidence').upload(p, pdf, { contentType: 'application/pdf' }), `upload ${p}`)
  const evidence = (id: string, entity_kind: string, entity_ref: string, storage_path: string, visible_to_terral: boolean) =>
    ({ id, entity_kind, entity_ref, storage_path, file_name: 'e.pdf', uploader_role: 'don', visible_to_terral })
  await ins('evidence', [
    evidence(ID.evidenceVisible, 'deliverable', K.deliverable, PATH.visible, true),
    evidence(ID.evidenceHidden, 'deliverable', K.deliverable, PATH.hidden, false),
    evidence(ID.evidenceOnHiddenItem, 'open_item', K.openHidden, PATH.onHiddenItem, true),
  ])
  await ins('evidence_uploader', [ID.evidenceVisible, ID.evidenceHidden, ID.evidenceOnHiddenItem].map((evidence_id) => ({ evidence_id, uploader_id: ids.don })))

  const clients = {} as Record<Who, SupabaseClient>
  for (const who of Object.keys(EMAILS) as Who[]) clients[who] = await signIn(EMAILS[who])
  return { ids, clients }
}
