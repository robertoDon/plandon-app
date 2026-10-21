import { createClient } from '@supabase/supabase-js'

// The browser gets the project URL and the anon key only. RLS does the rest.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required (.env.local)')

export const supabase = createClient(url, anonKey)
