// @vitest-environment jsdom
// useSession must not send a signed-in user to /login because the profile read failed once.
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../src/domain/types'

type Result = { data: Profile | null; error: { message: string } | null }

const mock = vi.hoisted(() => {
  const m = {
    results: [] as Result[],
    reads: 0,
    authCb: undefined as undefined | ((event: string, s: unknown) => void),
    session: { user: { id: 'u1' } },
  }
  const supabase = {
    auth: {
      onAuthStateChange: (cb: (event: string, s: unknown) => void) => {
        m.authCb = cb
        queueMicrotask(() => cb('INITIAL_SESSION', m.session))
        return { data: { subscription: { unsubscribe() {} } } }
      },
      signOut: async () => {},
    },
    from: () => ({ select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle: async () => m.results[Math.min(m.reads++, m.results.length - 1)] }) }) }) }),
    channel: () => {
      const ch = { on: () => ch, subscribe: () => ch }
      return ch
    },
    removeChannel: async () => {},
  }
  return { m, supabase }
})
vi.mock('../src/lib/supabase', () => ({ supabase: mock.supabase }))

const { SessionProvider, useSession } = await import('../src/auth/useSession')
const { routeFor } = await import('../src/app/routes')

const don = { id: 'u1', display_name: 'Beto', role: 'don', status: 'approved', person_id: null, must_change_password: false } as Profile
const fail: Result = { data: null, error: { message: 'Failed to fetch' } }

function mount() {
  const seen: (string | null)[] = []
  const state: { error?: boolean } = {}
  function Probe() {
    const { profile, loading, error } = useSession()
    seen.push(routeFor(loading ? undefined : profile, '/don/hoje'))
    state.error = error
    return null
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider><Probe /></SessionProvider>
    </QueryClientProvider>,
  )
  return { seen, state }
}

afterEach(() => {
  cleanup()
  mock.m.reads = 0
})

describe('useSession', () => {
  it('a failed profile read is retried; the user is never sent to /login', async () => {
    mock.m.results = [fail, { data: don, error: null }]
    const { seen } = mount()
    await waitFor(() => expect(mock.m.reads).toBe(2))
    await waitFor(() => expect(seen.at(-1)).toBeNull())
    expect(seen).not.toContain('/login')
  })

  it('a read that keeps failing leaves the session loading with an error, not signed out', async () => {
    mock.m.results = [fail]
    const { seen, state } = mount()
    await waitFor(() => expect(state.error).toBe(true), { timeout: 2000 })
    expect(seen).not.toContain('/login')
    expect(seen.every((r) => r === null)).toBe(true)
  })

  it('a missing profile row does sign the person out to /login; signing in again re-reads it', async () => {
    mock.m.results = [{ data: null, error: null }]
    const { seen } = mount()
    await waitFor(() => expect(seen.at(-1)).toBe('/login'))
    mock.m.results = [{ data: don, error: null }]
    mock.m.reads = 0
    act(() => mock.m.authCb!('SIGNED_IN', mock.m.session)) // same user id: no uid change to trigger a read
    await waitFor(() => expect(seen.at(-1)).toBeNull())
  })
})
