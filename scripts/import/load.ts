// npm run import:load [-- --reset] [--yes-remote]
// Loads data/import/*.json (through the parser) into Supabase with the service role and verifies the result.
import { existsSync, readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TABLE_OF, type PlanData } from '../../src/domain/types'
import { loadRaw, parseWorkbook } from './parse'
import { applyOverrides, guardHits, type Override } from './guard'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const args = new Set(process.argv.slice(2))
const reset = args.has('--reset')
const url = process.env.SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)
const die = (msg: string): never => { console.error(msg); process.exit(1) }

if (!url || !key) die('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local).')
if (reset && !isLocal && !args.has('--yes-remote')) die(`Refusing --reset on ${url}: not localhost. Pass --yes-remote to wipe a remote database.`)

// Insert order = FK order; reset deletes in reverse.
const ORDER: (keyof PlanData)[] = [
  'people', 'deliverables', 'tasks', 'blocks', 'rituals', 'ritual_occurrences', 'decisions', 'to_schedule',
  'to_schedule_plan', 'open_items', 'open_items_internal', 'goals', 'traceability', 'dependencies',
]
const ALL_TABLES = [...ORDER, 'manual_risks', 'comments', 'evidence'] as (keyof PlanData)[]
const PK: Record<string, string> = { person: 'id', deliverable: 'code', decision: 'code', open_item: 'code', open_item_internal: 'code', to_schedule_plan: 'to_schedule_id' }
const pk = (table: string) => PK[table] ?? 'id'

// --- parse, override, guard (before any DB write) ---
const data = parseWorkbook(loadRaw())
const { warnings, ...plan } = data
const overridesFile = 'data/import/overrides.json'
const overrides: Override[] = existsSync(overridesFile) ? JSON.parse(readFileSync(overridesFile, 'utf8')) : []
applyOverrides(plan, overrides)
const hits = guardHits(plan)
if (hits.length) {
  console.error(`Text guard: ${hits.length} Terral-visible hit(s). Fix them in ${overridesFile} (rewrite the text or set visible_to_terral to false).`)
  for (const h of hits) console.error(`  ${h.table}  ${h.key}  ${h.field}  ${h.words.join(', ')}`)
  process.exit(1)
}

const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) die(`${what}: ${r.error.message}`)
  return r.data as T
}
const count = async (t: string) => {
  const r = await db.from(t).select('*', { count: 'exact', head: true })
  if (r.error) die(`count ${t}: ${r.error.message}`)
  return r.count ?? 0
}

// --- 1. reset ---
if (reset) {
  for (const k of [...ALL_TABLES].reverse()) {
    const t = TABLE_OF[k]
    must(await db.from(t).delete().not(pk(t), 'is', null), `reset ${t}`)
  }
  must(await db.from('history').delete().gt('id', 0), 'reset history')
  console.log('reset: domain tables (incl. comments, evidence, manual_risk) and history cleared')
} else {
  for (const k of ORDER) if ((await count(TABLE_OF[k])) > 0) die(`${TABLE_OF[k]} is not empty. Use --reset to reload.`)
}

const loadStart = new Date().toISOString()
// --- 2. insert ---
for (const k of ORDER) {
  const rows = (plan as Record<string, object[]>)[k]
  for (let i = 0; i < rows.length; i += 500) must(await db.from(TABLE_OF[k]).insert(rows.slice(i, i + 500)), `insert ${TABLE_OF[k]}`)
}
// The load itself is not user history (service-role writes have no user).
must(await db.from('history').delete().is('user_id', null).gte('at', loadStart), 'clear import history')

// --- 3. admin user ---
const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env
let adminOk = false
let adminId = ''
if (!email || !password) console.warn('WARNING: ADMIN_EMAIL / ADMIN_PASSWORD missing in .env.local: admin user not created.')
else {
  const lu = await db.auth.admin.listUsers({ perPage: 1000 })
  if (lu.error) die(`list users: ${lu.error.message}`)
  const list = lu.data.users
  const found = list.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  let id = found?.id
  const fields: Record<string, unknown> = { role: 'don', status: 'approved', person_id: 'beto' }
  if (!id) {
    // New user only: an existing account keeps its password.
    const res = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Beto' } })
    if (res.error || !res.data.user) die(`admin user: ${res.error?.message}`)
    id = res.data.user!.id
    fields.must_change_password = false
  }
  adminId = id
  must(await db.from('profiles').update(fields).eq('id', id), 'admin profile')
  adminOk = true
}

// --- 4/5. verify ---
const fails: string[] = []
const rows: [string, string | number, string | number, string][] = []
const check = (name: string, got: number | string, want: number | string, ok: boolean) => {
  rows.push([name, got, want, ok ? 'ok' : 'FAIL'])
  if (!ok) fails.push(name)
}
const EXPECT: Record<string, number> = { deliverable: 19, task: 85, block: 440, decision: 15, open_item: 32, to_schedule: 8 }
for (const [t, want] of Object.entries(EXPECT)) { const got = await count(t); check(`count ${t}`, got, want, got === want) }
for (const k of ORDER) {
  const t = TABLE_OF[k], got = await count(t), want = (plan as Record<string, object[]>)[k].length
  if (!(t in EXPECT)) check(`count ${t}`, got, want, got === want)
}
const blocks = must(await db.from('block').select('person_id,hours'), 'read blocks') as { person_id: string | null; hours: number }[]
const sum = (p: string) => blocks.filter((b) => b.person_id === p).reduce((s, b) => s + Number(b.hours), 0)
for (const [p, want] of [['david', 505.5], ['lucas', 482], ['beto', 240]] as const) { const got = sum(p); check(`block hours ${p}`, got.toFixed(2), want, Math.abs(got - want) <= 0.05) }
const plans = must(await db.from('to_schedule_plan').select('hours'), 'read plans') as { hours: number }[]
const toSched = plans.reduce((s, p) => s + Number(p.hours), 0)
check('to_schedule hours', toSched.toFixed(2), 104, Math.abs(toSched - 104) <= 0.05)
const open = must(await db.from('open_item').select('code,visible_to_terral'), 'read open items') as { code: string; visible_to_terral: boolean }[]
check('open items P / X', `${open.filter((o) => o.code.startsWith('P-')).length} / ${open.filter((o) => o.code.startsWith('X-')).length}`, '26 / 6', open.filter((o) => o.code.startsWith('P-')).length === 26 && open.filter((o) => o.code.startsWith('X-')).length === 6)
if (adminOk) {
  const p = must(await db.from('profiles').select('role,status,person_id').eq('id', adminId).single(), 'read admin profile') as { role: string; status: string; person_id: string }
  const good = p.role === 'don' && p.status === 'approved' && p.person_id === 'beto'
  check('admin profile', good ? 'don/approved/beto' : 'wrong', 'don/approved/beto', good)
}

console.log('\ncheck'.padEnd(26) + 'db'.padEnd(18) + 'expected'.padEnd(18) + 'result')
for (const [n, g, w, r] of rows) console.log(n.padEnd(25) + String(g).padEnd(18) + String(w).padEnd(18) + r)

const david = plan.people.find((p) => p.id === 'david')!
const slack = david.net_capacity_h! - david.reserved_h - sum('david') - toSched
console.log(`\nDavid slack: ${david.net_capacity_h} - ${david.reserved_h} - ${sum('david').toFixed(2)} - ${toSched} = ${slack.toFixed(1).replace('.', ',')} h (Painel: Folga medida 25,8)`)
console.log(`overrides applied: ${overrides.length}`)
console.log(warnings.length ? `parser warnings (${warnings.length}):\n- ${warnings.join('\n- ')}` : 'parser warnings: none')
if (fails.length) die(`\nFAILED: ${fails.join(', ')}`)
console.log('\nall checks ok')
