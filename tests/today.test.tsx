// @vitest-environment jsdom
// Don "Hoje": the done-check is optimistic, undoable, and rolls back on a failed save.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Block, OpenItem, Person, Profile } from '../src/domain/types'

type Rows = Record<string, unknown[]>
type Write = { table: string; values: Record<string, unknown>; match: Record<string, unknown> }

const mock = vi.hoisted(() => {
  const m = {
    db: {} as Rows,
    writes: [] as Write[],
    fail: false,
    gate: null as Promise<void> | null, // holds the write in flight until the test opens it
    profile: null as unknown as Profile,
  }
  // Thenable query builder: the read chains the data layer uses, resolved from the fixture.
  const read = (t: string) => {
    const p = Promise.resolve().then(() => ({ data: structuredClone(m.db[t] ?? []), error: null })) as Promise<unknown> & Record<string, unknown>
    p.order = () => p
    p.limit = () => p
    return p
  }
  const supabase = {
    from: (t: string) => ({
      select: () => read(t),
      update: (values: Record<string, unknown>) => ({
        match: (match: Record<string, unknown>) => ({
          select: async () => {
            m.writes.push({ table: t, values, match })
            await new Promise((r) => setTimeout(r, 10))
            await m.gate
            if (m.fail) return { data: null, error: { message: 'boom' } }
            const rows = (m.db[t] ?? []) as Record<string, unknown>[]
            for (const r of rows) if (Object.entries(match).every(([k, v]) => r[k] === v)) Object.assign(r, values)
            return { data: [], error: null }
          },
        }),
      }),
    }),
  }
  return { m, supabase }
})
vi.mock('../src/lib/supabase', () => ({ supabase: mock.supabase }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ profile: mock.m.profile }) }))

const { ToastProvider } = await import('../src/ui')
const { default: Hoje } = await import('../src/views/don/Hoje')
const { default: Semana } = await import('../src/views/don/Semana')
const { m } = mock

const person = (id: string, name: string): Person => ({ id, name, net_capacity_h: null, reserved_h: 0, daily_cap_h: 8, weekly_cap_h: 40 })
const block = (id: string, date: string, hours: number, person_id = 'beto', description = `Tarefa ${id}`): Block => ({
  id, date, week: 'S03', type: 'Tarefa', front: 'Vendas', code: '3.1', description, person_id, hours, due: null, task_id: null, done: false, done_at: null,
})
const item = (code: string, due: string): OpenItem => ({
  code, kind: 'pendencia', text: `Item ${code}`, owner_public: 'Terral', due, due_text: null, effect: null, status: 'open', visible_to_terral: true,
})

function fixture(): Rows {
  return {
    person: [person('beto', 'Beto'), person('david', 'David')],
    block: [
      block('first', '2026-10-26', 1), // project window: 26/10 ...
      block('last', '2027-04-30', 1), // ... to 30/04
      block('b1', '2026-11-10', 2, 'beto', 'Extrair a base de vendas'),
      block('b2', '2026-11-11', 5),
      block('b3', '2026-11-11', 4), // 9 h on 11/11: over the 8 h cap
      block('d1', '2026-11-10', 3, 'david'),
    ],
    deliverable: [{ code: '3.1', name: 'Segmentação', front: 'Vendas' }],
    open_item: [item('P-01', '2026-11-12')],
  }
}

const don = (person_id: string | null): Profile => ({ id: 'u1', display_name: 'Beto Teixeira', role: 'don', status: 'approved', person_id, must_change_password: false })

function mount(today: string, View = Hoje) {
  window.history.replaceState({}, '', `/don/hoje?today=${today}`)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider><View /></ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const tap = (el: HTMLElement) => {
  fireEvent.pointerDown(el, { buttons: 1 })
  fireEvent.click(el)
}

beforeEach(() => {
  m.db = fixture()
  m.writes = []
  m.fail = false
  m.gate = null
  m.profile = don('beto')
})
afterEach(cleanup)

describe('Hoje', () => {
  it('greets with the first name and lists the signed-in person’s blocks of the day', async () => {
    mount('2026-11-10')
    expect(await screen.findByRole('checkbox', { name: 'Extrair a base de vendas' })).not.toBeChecked()
    expect(screen.getByRole('heading', { level: 1, name: 'Seu dia, Beto.' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Tarefa d1' })).toBeNull() // David's
  })

  it('a tap ticks at once, saves done + done_at, and offers "Desfazer"', async () => {
    let open = () => {}
    m.gate = new Promise((r) => (open = r))
    mount('2026-11-10')
    const box = await screen.findByRole('checkbox', { name: 'Extrair a base de vendas' })
    tap(box)
    expect(box).toBeChecked()
    // the plan cache follows before the server answers: the row shows done while the write is in flight
    await waitFor(() => expect(box.closest('li')).toHaveClass('done'))
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
    open()
    expect(await screen.findByRole('button', { name: 'Desfazer' })).toBeInTheDocument()
    expect(m.writes[0]).toMatchObject({ table: 'block', values: { done: true }, match: { id: 'b1' } })
    expect(typeof m.writes[0].values.done_at).toBe('string')
    expect(box).toBeChecked()
  })

  it('"Desfazer" unticks: the inverse write, done_at null', async () => {
    mount('2026-11-10')
    const box = await screen.findByRole('checkbox', { name: 'Extrair a base de vendas' })
    tap(box)
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(box).not.toBeChecked())
    await waitFor(() => expect(m.writes).toHaveLength(2))
    expect(m.writes[1]).toMatchObject({ values: { done: false, done_at: null }, match: { id: 'b1' } })
    await waitFor(() => expect((m.db.block as Block[]).find((b) => b.id === 'b1')!.done).toBe(false))
    expect(box).not.toBeChecked()
  })

  it('a failed save rolls the check back and says "Não salvou"', async () => {
    m.fail = true
    mount('2026-11-10')
    const box = await screen.findByRole('checkbox', { name: 'Extrair a base de vendas' })
    tap(box)
    expect(box).toBeChecked()
    expect(await screen.findByText(/Não salvou/)).toBeInTheDocument()
    await waitFor(() => expect(box).not.toBeChecked())
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  })

  it('before the project window: "O projeto começa em 26/10."', async () => {
    mount('2026-10-21')
    expect(await screen.findByText('O projeto começa em 26/10.')).toBeInTheDocument()
  })

  it('after the project window: "O projeto terminou em 30/04."', async () => {
    mount('2027-05-10')
    expect(await screen.findByText('O projeto terminou em 30/04.')).toBeInTheDocument()
  })

  it('a day with nothing: "Nada agendado para hoje."', async () => {
    mount('2026-11-12')
    expect(await screen.findByText('Nada agendado para hoje.')).toBeInTheDocument()
  })

  it('week strip: a red dot on the day over capacity; tapping a day selects it', async () => {
    mount('2026-11-10')
    const strip = await screen.findByRole('group', { name: 'Semana' })
    const wed = within(strip).getByRole('button', { name: /11\/11/ })
    expect(wed).toHaveAccessibleName(expect.stringContaining('acima do limite'))
    expect(within(strip).getByRole('button', { name: /10\/11/ })).not.toHaveAccessibleName(expect.stringContaining('acima do limite'))
    fireEvent.click(wed)
    expect(wed).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('checkbox', { name: 'Tarefa b2' })).toBeInTheDocument()
  })

  it('weekly load bar per person', async () => {
    mount('2026-11-10')
    expect(await screen.findByRole('img', { name: 'Beto: 11 h de 40 h' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'David: 3 h de 40 h' })).toBeInTheDocument()
  })

  it('pendências due within 7 days', async () => {
    mount('2026-11-10')
    expect(await screen.findByText('P-01')).toBeInTheDocument()
  })

  it('no person linked to the account: a person picker instead of failing', async () => {
    m.profile = don(null)
    mount('2026-11-10')
    const picker = await screen.findByRole('radiogroup', { name: 'Pessoa' })
    fireEvent.click(within(picker).getByRole('radio', { name: 'David' }))
    expect(await screen.findByRole('checkbox', { name: 'Tarefa d1' })).toBeInTheDocument()
  })
})

describe('Minha semana', () => {
  it('lists the week day by day; open past blocks are "ficou para trás"', async () => {
    ;(m.db.block as Block[]).find((b) => b.id === 'b2')!.done = true
    mount('2026-11-11', Semana)
    const late = await screen.findByRole('checkbox', { name: 'Extrair a base de vendas' }) // 10/11, open
    expect(within(late.closest('li')!).getByText('ficou para trás')).toBeInTheDocument()
    expect(within(screen.getByRole('checkbox', { name: 'Tarefa b2' }).closest('li')!).queryByText('ficou para trás')).toBeNull() // done
    expect(within(screen.getByRole('checkbox', { name: 'Tarefa b3' }).closest('li')!).queryByText('ficou para trás')).toBeNull() // today
    expect(screen.getByRole('region', { name: 'Hoje, 11/11' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Tarefa d1' })).toBeNull()
  })
})
