// POST { user_id, password } with the caller's JWT. Only an approved Don may call it (spec §6).
// Sets a temporary password and must_change_password = true. The service-role key stays here (Supabase injects it).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handle } from './handler.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve((req) =>
  handle(req, {
    userIdFromJwt: async (jwt) => (await admin.auth.getUser(jwt)).data.user?.id ?? null,
    profile: async (id) =>
      (await admin.from('profiles').select('role, status, must_change_password').eq('id', id).maybeSingle()).data,
    // through 0011's set_must_change_password, so the history row names the Don who asked
    setMustChange: async (id, value, by) =>
      (await admin.rpc('set_must_change_password', { p_id: id, p_value: value, p_by: by })).error?.message ?? null,
    setPassword: async (id, password) => (await admin.auth.admin.updateUserById(id, { password })).error?.message ?? null,
  }),
)
