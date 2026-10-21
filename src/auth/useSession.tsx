import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Profile } from '../domain/types'

interface SessionState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** The profile could not be read (network, server). The session is kept; nobody is signed out for it. */
  error: boolean
  /** Re-reads the own profile (after a password change, or to retry after an error). */
  refresh: () => Promise<void>
}

const Ctx = createContext<SessionState | null>(null)
const RETRY_MS = 400

/** The own profile row, or null when it does not exist. Throws when it cannot be read: a failure is not "no profile". */
async function readProfile(id: string): Promise<Profile | null> {
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).abortSignal(AbortSignal.timeout(8000)).maybeSingle()
    if (!error) return (data as Profile | null) ?? null
    if (attempt >= 1) throw error
    await new Promise((r) => setTimeout(r, RETRY_MS))
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  // undefined = not known yet
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [error, setError] = useState(false)
  const load = useRef<() => Promise<void>>(async () => {})
  const uid = session?.user.id

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // A sign-in with the same user id changes no state the effect below watches: read the profile again
      // (it may have failed or been missing before). Deferred: no Supabase call inside this callback.
      if (event === 'SIGNED_IN') setTimeout(() => void load.current(), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return
    // A different person on this browser must never see the previous one's cached data.
    qc.clear()
    setProfile(undefined)
    setError(false)
    let live = true
    let inFlight: Promise<void> | null = null
    // Focus and supabase-js's own SIGNED_IN on tab return often come together: one read serves both.
    load.current = () =>
      (inFlight ??= (async () => {
        try {
          const p = uid ? await readProfile(uid) : null
          if (live) {
            setProfile(p)
            setError(false)
          }
        } catch {
          if (live) setError(true) // keep the last known profile (or keep loading): never "signed out"
        } finally {
          inFlight = null
        }
      })())
    void load.current()
    if (!uid) return
    // Approval, blocking and role changes land without a reload (the pending screen moves on by itself).
    const ch = supabase
      .channel(`profile:${uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, (e) => setProfile(e.new as Profile))
      .subscribe()
    const onFocus = () => void load.current()
    window.addEventListener('focus', onFocus)
    return () => {
      live = false
      window.removeEventListener('focus', onFocus)
      void supabase.removeChannel(ch)
    }
    // the session object changes on every token refresh; only the user id matters here
  }, [uid, session === undefined, qc])

  const value: SessionState = {
    session: session ?? null,
    profile: profile ?? null,
    loading: session === undefined || profile === undefined,
    error,
    refresh: () => load.current(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionState {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSession outside SessionProvider')
  return s
}

// local: leaving on one device must not end the sessions on the others (global is the supabase-js default)
export const signOut = () => supabase.auth.signOut({ scope: 'local' })
