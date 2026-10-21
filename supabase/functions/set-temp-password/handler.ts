// Pure request handler for set-temp-password: no Deno or npm imports, so Vitest runs it with fake deps.
// index.ts wires the real Supabase calls. Never log or echo the password.

export interface TargetProfile {
  role: string | null
  status: string
  must_change_password: boolean
}

export interface Deps {
  /** Verifies the JWT with Supabase Auth. Null when the token is missing, expired or forged. */
  userIdFromJwt(jwt: string): Promise<string | null>
  profile(id: string): Promise<TargetProfile | null>
  /** Each write returns an error message, or null on success. `by`: the Don who asked (logged in history). */
  setMustChange(id: string, value: boolean, by: string): Promise<string | null>
  setPassword(id: string, password: string): Promise<string | null>
}

export const MIN_PASSWORD = 8
const MAX_PASSWORD = 72 // bcrypt reads only 72 bytes
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CORS = {
  'Access-Control-Allow-Origin': '*', // auth is the bearer token, not a cookie
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const jwt = req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]
  const caller = jwt ? await deps.userIdFromJwt(jwt) : null
  if (!caller) return json(401, { error: 'unauthorized' })
  const me = await deps.profile(caller)
  if (me?.role !== 'don' || me.status !== 'approved') return json(403, { error: 'forbidden' })

  let body: { user_id?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid_body' })
  }
  const { user_id, password } = body ?? {}
  if (typeof user_id !== 'string' || !UUID.test(user_id)) return json(400, { error: 'invalid_user_id' })
  // Your own password changes on /nova-senha; a temporary one here would end your own session.
  if (user_id.toLowerCase() === caller.toLowerCase()) return json(403, { error: 'own_account' })
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return json(400, { error: 'password_too_short', min: MIN_PASSWORD })
  if (new TextEncoder().encode(password).length > MAX_PASSWORD) return json(400, { error: 'password_too_long', max: MAX_PASSWORD })

  const target = await deps.profile(user_id)
  if (!target) return json(404, { error: 'user_not_found' })

  // Flag first: if the password write fails, the flag goes back and nothing changed.
  if (await deps.setMustChange(user_id, true, caller)) return json(500, { error: 'flag_failed' })
  if (await deps.setPassword(user_id, password)) {
    await deps.setMustChange(user_id, target.must_change_password, caller)
    return json(400, { error: 'password_rejected' })
  }
  return json(200, { ok: true })
}
