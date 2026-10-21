import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Profile } from '../domain/types'

interface SessionState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** Re-reads the own profile (after a password change, or when the window regains focus). */
  refresh: () => Promise<void>
}

const Ctx = createContext<SessionState | null>(null)

async function fetchProfile(id: string | undefined): Promise<Profile | null> {
  if (!id) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  return (data as Profile | null) ?? null
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  // undefined = not known yet
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const uid = session?.user.id

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])


  useEffect(() => {
    if (session === undefined) return
    // A different person on this browser must never see the previous one's cached data.
    qc.clear()
    setProfile(undefined)
    let live = true
    const load = () => fetchProfile(uid).then((p) => live && setProfile(p))
    void load()
    if (!uid) return
    // Approval, blocking and role changes land without a reload (the pending screen moves on by itself).
    const ch = supabase
      .channel(`profile:${uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, (e) => setProfile(e.new as Profile))
      .subscribe()
    const onFocus = () => void load()
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
    refresh: () => fetchProfile(uid).then(setProfile),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionState {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSession outside SessionProvider')
  return s
}

export const signOut = () => supabase.auth.signOut()
