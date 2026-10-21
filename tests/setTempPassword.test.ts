// @vitest-environment node
// set-temp-password: the handler with fake deps, then the real function on the local stack (`npx supabase functions serve`).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handle, type Deps, type TargetProfile } from '../supabase/functions/set-temp-password/handler'
import { admin, anon, localStack, url } from './helpers/supa'

const DON = randomUUID(), TARGET = randomUUID()
const SECRET = 'segredo-temporario-1'

function fake(profiles: Record<string, TargetProfile>, opts: { failPassword?: boolean } = {}) {
  const calls: string[] = []
  const deps: Deps = {
    userIdFromJwt: async (jwt) => (jwt === 'good' ? DON : null),
    profile: async (id) => profiles[id] ?? null,
    setMustChange: async (id, v) => (calls.push(`flag ${id === TARGET ? 'target' : id} ${v}`), null),
    setPassword: async (id) => (calls.push(`password ${id === TARGET ? 'target' : id}`), opts.failPassword ? 'weak' : null),
  }
  return { deps, calls }
}
const req = (body: unknown, jwt: string | null = 'good', method = 'POST') =>
  new Request('http://x/set-temp-password', {
    method,
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  })
const don = { role: 'don', status: 'approved', must_change_password: false }
const target = { role: 'terral', status: 'approved', must_change_password: false }

describe('set-temp-password handler', () => {
  it('refuses anyone but an approved Don, before touching anything', async () => {
    for (const [jwt, me, status] of [
      [null, don, 401], ['forged', don, 401],
      ['good', { ...don, status: 'pending' }, 403], ['good', { ...don, status: 'blocked' }, 403],
      ['good', { ...don, role: 'terral' }, 403], ['good', { ...don, role: null }, 403], ['good', undefined, 403],
    ] as const) {
      const { deps, calls } = fake(me ? { [DON]: me, [TARGET]: target } : { [TARGET]: target })
      expect((await handle(req({ user_id: TARGET, password: SECRET }, jwt), deps)).status, `${jwt} ${JSON.stringify(me)}`).toBe(status)
      expect(calls).toEqual([])
    }
  })

  it('validates the body; the password never comes back', async () => {
    const { deps, calls } = fake({ [DON]: don, [TARGET]: target })
    for (const [body, error] of [
      ['not json', 'invalid_body'], [{ password: SECRET }, 'invalid_user_id'], [{ user_id: 'x', password: SECRET }, 'invalid_user_id'],
      [{ user_id: TARGET }, 'password_too_short'], [{ user_id: TARGET, password: 'curta12' }, 'password_too_short'],
      [{ user_id: TARGET, password: 'é'.repeat(40) }, 'password_too_long'],
    ] as const) {
      const r = await handle(req(body), deps)
      expect(r.status).toBe(400)
      const text = await r.text()
      expect(JSON.parse(text).error).toBe(error)
      expect(text).not.toContain(SECRET)
    }
    expect((await handle(req({ user_id: randomUUID(), password: SECRET }), deps)).status).toBe(404)
    expect((await handle(req(null, 'good', 'GET'), deps)).status).toBe(405)
    expect((await handle(req(null, null, 'OPTIONS'), deps)).status).toBe(204)
    expect(calls).toEqual([])
  })

  it('refuses the own account of the caller', async () => {
    const { deps, calls } = fake({ [DON]: don, [TARGET]: target })
    const r = await handle(req({ user_id: DON.toUpperCase(), password: SECRET }), deps)
    expect([r.status, await r.json()]).toEqual([403, { error: 'own_account' }])
    expect(calls).toEqual([])
  })

  it('sets the flag, then the password; a refused password puts the flag back', async () => {
    const ok = fake({ [DON]: don, [TARGET]: target })
    const r = await handle(req({ user_id: TARGET, password: SECRET }), ok.deps)
    expect([r.status, await r.json()]).toEqual([200, { ok: true }])
    expect(ok.calls).toEqual(['flag target true', 'password target'])

    const bad = fake({ [DON]: don, [TARGET]: target }, { failPassword: true })
    const r2 = await handle(req({ user_id: TARGET, password: SECRET }), bad.deps)
    expect([r2.status, await r2.json()]).toEqual([400, { error: 'password_rejected' }])
    expect(bad.calls).toEqual(['flag target true', 'password target', 'flag target false'])
  })
})

// --- the deployed function, on the local stack ---
const FN = `${url}/functions/v1/set-temp-password`
const served = localStack && (await fetch(FN, { method: 'OPTIONS' }).then((r) => r.status === 204, () => false))
const PASSWORD = 'tp-test-password-1'
const EMAILS = { don: 'don@tp.test', terral: 'terral@tp.test', pending: 'pending@tp.test', target: 'target@tp.test' } as const // own domain: rls.test.ts cleans @x.test in parallel
type Who = keyof typeof EMAILS

describe.skipIf(!served)('set-temp-password on the local stack', () => {
  const ids = {} as Record<Who, string>
  const tokens = {} as Record<Who, string>
  const a = admin()
  const cleanup = async () => {
    const { data } = await a.auth.admin.listUsers({ perPage: 1000 })
    for (const u of data.users.filter((u) => u.email?.endsWith('@tp.test'))) {
      await a.auth.admin.deleteUser(u.id)
      await a.from('history').delete().eq('row_ref', u.id)
    }
  }
  const call = (who: Who | null, body: object) =>
    fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) }, body: JSON.stringify(body) })
  const signIn = async (email: string, password: string): Promise<SupabaseClient | null> => {
    const c = anon()
    return (await c.auth.signInWithPassword({ email, password })).error ? null : c
  }

  beforeAll(async () => {
    await cleanup()
    for (const who of Object.keys(EMAILS) as Who[]) {
      const { data, error } = await a.auth.admin.createUser({ email: EMAILS[who], password: PASSWORD, email_confirm: true, user_metadata: { display_name: who } })
      if (error) throw error
      ids[who] = data.user!.id
    }
    await a.from('profiles').update({ role: 'don', status: 'approved' }).eq('id', ids.don)
    await a.from('profiles').update({ role: 'terral', status: 'approved' }).in('id', [ids.terral, ids.target])
    await a.from('profiles').update({ role: 'don' }).eq('id', ids.pending) // a Don account not yet approved
    for (const who of Object.keys(EMAILS) as Who[]) tokens[who] = (await (await signIn(EMAILS[who], PASSWORD))!.auth.getSession()).data.session!.access_token
  }, 60_000)
  afterAll(cleanup, 60_000)

  it('refuses callers who are not an approved Don', async () => {
    expect((await call(null, { user_id: ids.target, password: 'nova-senha-123' })).status).toBe(401)
    for (const who of ['terral', 'pending', 'target'] as const) expect((await call(who, { user_id: ids.target, password: 'nova-senha-123' })).status, who).toBe(403)
    expect((await call('don', { user_id: ids.don, password: 'nova-senha-123' })).status).toBe(403) // not on yourself
    expect(await signIn(EMAILS.target, PASSWORD)).not.toBeNull() // untouched
    expect(await signIn(EMAILS.don, PASSWORD)).not.toBeNull()
  })

  it('an approved Don sets a temporary password and the change flag', async () => {
    expect((await call('don', { user_id: ids.target, password: 'curta' })).status).toBe(400)
    expect((await call('don', { user_id: randomUUID(), password: 'nova-senha-123' })).status).toBe(404)
    const r = await call('don', { user_id: ids.target, password: 'nova-senha-123' })
    expect([r.status, await r.json()]).toEqual([200, { ok: true }])
    expect((await a.from('profiles').select('must_change_password').eq('id', ids.target).single()).data).toEqual({ must_change_password: true })
    expect(await signIn(EMAILS.target, PASSWORD)).toBeNull()
    const c = await signIn(EMAILS.target, 'nova-senha-123')
    expect(c).not.toBeNull()
    // the person then picks their own password and clears the flag (the /nova-senha screen)
    expect((await c!.auth.updateUser({ password: 'minha-senha-123' })).error).toBeNull()
    expect((await c!.rpc('clear_must_change_password')).error).toBeNull()
    expect((await a.from('profiles').select('must_change_password').eq('id', ids.target).single()).data).toEqual({ must_change_password: false })
  })
})
