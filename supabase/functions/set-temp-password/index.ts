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
    setMustChange: async (id, value) =>
      (await admin.from('profiles').update({ must_change_password: value }).eq('id', id)).error?.message ?? null,
    setPassword: async (id, password) => (await admin.auth.admin.updateUserById(id, { password })).error?.message ?? null,
  }),
)
