// @vitest-environment jsdom
// useMutate with writes in flight at once: each optimistic change survives the others' answers and refetches.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Block, Profile } from '../src/domain/types'


const mock = vi.hoisted(() => {
  const m = {
    db: {} as Record<string, unknown[]>,
    writes: [] as { id: unknown; done: unknown; answer: (ok: boolean) => void }[],
    reads: 0, // plan loads started (one per table each)
    readGate: null as Promise<void> | null, // holds every read until opened
  }
  const read = (t: string) => {
    if (t === 'block') m.reads++
    const p = (async () => {
      await m.readGate
      return { data: structuredClone(m.db[t] ?? []), error: null }
    })() as Promise<unknown> & Record<string, unknown>
    p.order = () => p
    p.limit = () => p
    return p
  }
  const supabase = {
    from: (t: string) => ({
      select: () => read(t),
      update: (values: Record<string, unknown>) => ({
        match: (match: Record<string, unknown>) => ({
          select: () =>
            new Promise((resolve) => {
              m.writes.push({
                id: match.id, done: values.done,
                answer: (ok) => {
                  if (!ok) return resolve({ data: null, error: { message: 'boom' } })
                  for (const r of (m.db[t] ?? []) as Record<string, unknown>[]) if (r.id === match.id) Object.assign(r, values)
                  resolve({ data: [], error: null })
                },
              })
            }),
        }),
      }),
    }),
  }
  return { m, supabase }
})
vi.mock('../src/lib/supabase', () => ({ supabase: mock.supabase }))
const don = { id: 'u1', display_name: 'Beto', role: 'don', status: 'approved', person_id: 'beto', must_change_password: false } as Profile
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ profile: don }) }))

const { ToastProvider } = await import('../src/ui')
const { usePlanData } = await import('../src/lib/data')
const { useToggleBlock } = await import('../src/don/blocks')
const { m } = mock

const block = (id: string): Block => ({
  id, date: '2026-11-10', week: 'S03', type: 'Tarefa', front: 'Vendas', code: null, description: id, person_id: 'beto', hours: 1, due: null, task_id: null, done: false, done_at: null,
})

/** Shows the cache as it is (no Check in between, which keeps its own optimistic value). */
function Harness() {
  const { data } = usePlanData()
  const toggle = useToggleBlock()
  if (!data) return null
  return (
    <ul>
      {data.blocks.map((b) => (
        <li key={b.id}>
          <button onClick={() => toggle(b.id, !b.done)}>tick {b.id}</button>
          <output aria-label={b.id}>{String(b.done)}</output>
        </li>
      ))}
    </ul>
  )
}

async function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><ToastProvider><Harness /></ToastProvider></QueryClientProvider>)
  await screen.findByRole('button', { name: 'tick A' })
}
const shown = (id: string) => screen.getByRole('status', { name: id }).textContent
const tick = (id: string) => fireEvent.click(screen.getByRole('button', { name: `tick ${id}` }))
const answer = async (i: number, ok: boolean) => {
  await waitFor(() => expect(m.writes.length).toBeGreaterThan(i))
  await act(async () => m.writes[i].answer(ok))
}

beforeEach(() => {
  m.db = { block: [block('A'), block('B')] }
  m.writes = []
  m.reads = 0
  m.readGate = null
})
afterEach(cleanup)

describe('useMutate, writes in flight together', () => {
  it('two quick ticks both stay ticked, through both answers and the one refetch at the end', async () => {
    await mount()
    tick('A')
    tick('B')
    await waitFor(() => expect([shown('A'), shown('B')]).toEqual(['true', 'true']))
    const before = m.reads
    await answer(0, true)
    // A's answer must not refetch while B is in flight: the server does not have B yet
    expect(m.reads).toBe(before)
    expect([shown('A'), shown('B')]).toEqual(['true', 'true'])
    await answer(1, true)
    await waitFor(() => expect(m.reads).toBe(before + 1))
    await waitFor(() => expect([shown('A'), shown('B')]).toEqual(['true', 'true']))
  })

  it('A fails while B is in flight: A rolls back, B stays ticked', async () => {
    await mount()
    tick('A')
    tick('B')
    await waitFor(() => expect([shown('A'), shown('B')]).toEqual(['true', 'true']))
    await answer(0, false)
    await waitFor(() => expect(shown('A')).toBe('false'))
    expect(shown('B')).toBe('true')
    expect(screen.getByText('Não salvou. Tente de novo.')).toBeInTheDocument()
    await answer(1, true)
    await waitFor(() => expect([shown('A'), shown('B')]).toEqual(['false', 'true']))
  })

  it('B fails after A succeeded: B rolls back, A stays ticked', async () => {
    await mount()
    tick('A')
    tick('B')
    await answer(0, true)
    await answer(1, false)
    await waitFor(() => expect(shown('B')).toBe('false'))
    expect(shown('A')).toBe('true')
  })

  it('the "Desfazer" toast shows on the save answer, without waiting for the refetch', async () => {
    await mount()
    let open = () => {}
    m.readGate = new Promise((r) => (open = r))
    tick('A')
    const before = m.reads
    await answer(0, true)
    expect(await screen.findByRole('button', { name: 'Desfazer' })).toBeInTheDocument()
    expect(m.reads).toBe(before + 1) // the refetch started and is still held
    open()
  })
})

