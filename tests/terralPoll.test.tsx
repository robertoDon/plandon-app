// @vitest-environment jsdom
// Terral's data refreshes every 60 s while the page is visible: Realtime never tells Terral that a row was hidden
// from it (the UPDATE fails Terral's RLS, so no event comes). Don's plan does not poll (Realtime reaches Don).
import { act, cleanup, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Profile } from '../src/domain/types'

const mock = vi.hoisted(() => {
  const m = { reads: { deliverable: 0 }, profile: null as unknown }
  const read = (t: string) => {
    if (t === 'deliverable') m.reads.deliverable++
    const p = Promise.resolve({ data: [], error: null }) as Promise<unknown> & Record<string, unknown>
    p.order = () => p
    p.limit = () => p
    return p
  }
  return { m, supabase: { from: (t: string) => ({ select: () => read(t) }) } }
})
vi.mock('../src/lib/supabase', () => ({ supabase: mock.supabase }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ profile: mock.m.profile }) }))

const { useTerralData } = await import('../src/lib/data')
const { m } = mock
const who = (role: 'don' | 'terral') => ({ id: 'u', display_name: 'X', role, status: 'approved', person_id: null, must_change_password: false }) as Profile

function Probe() {
  useTerralData()
  return null
}
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Probe /></QueryClientProvider>)
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })

beforeEach(() => {
  vi.useFakeTimers()
  m.reads.deliverable = 0
})
afterEach(() => {
  cleanup()
  focusManager.setFocused(undefined)
  vi.useRealTimers()
})

it('Terral: refetches every 60 s while visible, not while hidden', async () => {
  m.profile = who('terral')
  mount()
  await flush()
  expect(m.reads.deliverable).toBe(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(59_000) })
  expect(m.reads.deliverable).toBe(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
  expect(m.reads.deliverable).toBe(2)
  focusManager.setFocused(false) // the tab went to the background
  await act(async () => { await vi.advanceTimersByTimeAsync(180_000) })
  expect(m.reads.deliverable).toBe(2)
})

it('Don (preview, meeting): no polling, Realtime brings every change', async () => {
  m.profile = who('don')
  mount()
  await flush()
  expect(m.reads.deliverable).toBe(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(180_000) })
  expect(m.reads.deliverable).toBe(1)
})
