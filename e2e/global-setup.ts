// Creates throwaway e2e users with the service role (local stack only) and removes them, with the rows they touched, afterwards.
// Credentials live in process.env for this run only: never written to disk, never printed.
import { existsSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export default async function globalSetup() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local')
  const url = process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) || !key) {
    throw new Error('e2e refuses to run: SUPABASE_URL must be localhost/127.0.0.1 and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local).')
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const must = <T extends { error: { message: string } | null }>(r: T, what: string): T => {
    if (r.error) throw new Error(`e2e setup ${what}: ${r.error.message}`)
    return r
  }

  // The import must be loaded: the tests read real plan data.
  const count = async (t: string) => must(await db.from(t).select('*', { count: 'exact', head: true }), `count ${t}`).count ?? 0
  if ((await count('block')) === 0 || (await count('deliverable')) === 0) {
    throw new Error('e2e needs the plan data. The database is empty: run `npm run import:load -- --reset` and try again.')
  }
  const { data: del } = must(await db.from('deliverable').select('code').order('sort').limit(1), 'deliverable')
  process.env.E2E_CODE = del![0].code

  const run = randomUUID().slice(0, 8)
  const mk = async (kind: string, profile: object | null) => {
    const email = `e2e-${kind}-${run}@plandon.test`
    const password = randomBytes(18).toString('base64url')
    const { data } = must(await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `E2E ${kind}` } }), `createUser ${kind}`)
    if (profile) must(await db.from('profiles').update(profile).eq('id', data.user!.id), `profile ${kind}`)
    process.env[`E2E_${kind.toUpperCase()}_EMAIL`] = email
    process.env[`E2E_${kind.toUpperCase()}_PASSWORD`] = password
    return data.user!.id
  }
  const ids: string[] = []
  try {
    ids.push(await mk('don', { role: 'don', status: 'approved', person_id: 'beto' }))
    ids.push(await mk('terral', { role: 'terral', status: 'approved' }))
    ids.push(await mk('pending', null)) // signup trigger defaults: pending, no role
  } catch (e) {
    await cleanup(ids)
    throw e
  }

  async function cleanup(users: string[]) {
    if (!users.length) return
    // history rows the users wrote or that describe them; comments they wrote (none expected) go with their author
    await db.from('history').delete().in('user_id', users)
    await db.from('history').delete().in('row_ref', users)
    for (const id of users) await db.auth.admin.deleteUser(id)
    await db.from('history').delete().in('row_ref', users)
  }
  return () => cleanup(ids)
}
