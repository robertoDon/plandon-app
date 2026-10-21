// @vitest-environment jsdom
// Don editors for "A agendar" and goals: the Terral guard, optimistic writes with rollback and undo, the distributed switch.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../src/domain/types'

type Rows = Record<string, Record<string, unknown>[]>
type Write = { table: string; op: string; values: unknown; match?: Record<string, unknown> }

const mock = vi.hoisted(() => {
  const m = { db: {} as Rows, writes: [] as Write[], failOn: [] as string[], profile: null as unknown as Profile }
  const read = (t: string) => {
    const p = Promise.resolve().then(() => ({ data: structuredClone(m.db[t] ?? []), error: null })) as Promise<unknown> & Record<string, unknown>
    p.order = () => p
    p.limit = () => p
    return p
  }
  const hits = (r: Record<string, unknown>, match: Record<string, unknown>) => Object.entries(match).every(([k, x]) => r[k] === x)
  const done = async (t: string, op: string, values: unknown, match: Record<string, unknown> | undefined, apply: (db: Rows) => void) => {
    m.writes.push({ table: t, op, values, match })
    const db = m.db
    const fails = m.failOn.includes(t)
    await new Promise((r) => setTimeout(r, 10))
    if (fails) return { data: null, error: { message: 'boom' } }
    apply(db)
    return { data: [], error: null }
  }
  const supabase = {
    from: (t: string) => ({
      select: () => read(t),
      insert: (v: Record<string, unknown>) => ({ select: () => done(t, 'insert', v, undefined, (db) => (db[t] ??= []).push({ ...v })) }),
      update: (v: Record<string, unknown>) => ({
        match: (match: Record<string, unknown>) => ({
          select: () => done(t, 'update', v, match, (db) => { for (const r of db[t] ?? []) if (hits(r, match)) Object.assign(r, v) }),
        }),
      }),
      delete: () => ({
        match: (match: Record<string, unknown>) => ({
          select: () => done(t, 'delete', undefined, match, (db) => { db[t] = (db[t] ?? []).filter((r) => !hits(r, match)) }),
        }),
      }),
    }),
  }
  return { m, supabase }
})
vi.mock('../src/lib/supabase', () => ({ supabase: mock.supabase }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ profile: mock.m.profile }) }))

const { ToastProvider } = await import('../src/ui')
const { default: Agendar } = await import('../src/views/don/Agendar')
const { default: Metas } = await import('../src/views/don/Metas')
const { default: Equipe } = await import('../src/views/don/Equipe')
const { default: Riscos } = await import('../src/views/don/Riscos')
const { m } = mock

beforeAll(() => {
  const p = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void }
  p.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  p.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
})

const sched = (id: string, o: Record<string, unknown> = {}) => ({
  id, code: '3.1', what: `Agendar ${id}`, window_start: '2026-11-02', window_end: '2026-12-04', window_text: 'de 02/11/2026 a 04/12/2026', confirmed_date: null, ...o,
})
const goal = (id: string, sort: number, o: Record<string, unknown> = {}) => ({
  id, sort, level: 'Grupo', position: `Suporte ${sort}`, metric: `Métrica ${sort}`, baseline: '56%', state: 'Linha de base apurada', target: null, ...o,
})

function fixture(): Rows {
  return {
    person: [
      { id: 'david', name: 'David', net_capacity_h: 40, reserved_h: 0, daily_cap_h: 8, weekly_cap_h: 40 },
      { id: 'beto', name: 'Beto', net_capacity_h: null, reserved_h: 0, daily_cap_h: 8, weekly_cap_h: 40 },
    ],
    deliverable: [{ code: '3.1', name: 'Segmentação', front: 'Vendas', in_use_start: '2026-12-10', in_use_at: null, built_date: null, in_use_end: null, built_at: null, published_flag: null }],
    to_schedule: [
      sched('3.1-1', { confirmed_date: '2026-11-12' }), // confirmed, hours not distributed: the engine flags it
      sched('3.1-2', { what: 'Rodada dois' }),
      sched('3.1-3', { what: 'Sem plano' }), // no plan row
    ],
    to_schedule_plan: [
      { to_schedule_id: '3.1-1', person_id: 'david', hours: 5, distributed: false },
      { to_schedule_id: '3.1-2', person_id: 'david', hours: 9, distributed: true },
    ],
    goal: [
      goal('g1', 1), goal('g2', 2, { baseline: null, state: 'Definida, sem linha de base' }),
      goal('g3', 3, { level: 'Vendas · atacado', position: 'Norte', metric: 'Volume de cortes', state: 'Ainda não definida' }),
    ],
  }
}

const don: Profile = { id: 'u1', display_name: 'Beto Teixeira', role: 'don', status: 'approved', person_id: 'beto', must_change_password: false }

function mount(...views: (() => React.JSX.Element)[]) {
  window.history.replaceState({}, '', '/?today=2026-11-10')
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>{views.map((V, i) => <V key={i} />)}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const tap = (el: HTMLElement) => {
  fireEvent.pointerDown(el, { buttons: 1 })
  fireEvent.click(el)
}
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } })
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
const planOf = (id: string) => m.db.to_schedule_plan.find((r) => r.to_schedule_id === id)
const rowOf = (id: string) => m.db.to_schedule.find((r) => r.id === id)

beforeEach(() => {
  m.db = fixture()
  m.writes = []
  m.failOn = []
  m.profile = don
})
afterEach(cleanup)

describe('A agendar', () => {
  it('lists the items with hours (Don-only), window, confirmation and distribution, plus the totals', async () => {
    mount(Agendar)
    const list = await screen.findByRole('list', { name: 'Itens a agendar' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((li) => li.querySelector('.don-code')?.textContent)).toEqual(['3.1-1', '3.1-2', '3.1-3'])
    expect(rows[0]).toHaveTextContent('5 h · David')
    expect(rows[0]).toHaveTextContent('Confirmada 12/11')
    expect(rows[0]).toHaveTextContent('A distribuir')
    expect(rows[1]).toHaveTextContent('Distribuída')
    expect(rows[2]).toHaveTextContent('Sem horas')
    expect(screen.getByText('A agendar', { selector: '.overline' }).nextSibling).toHaveTextContent('5 h')
    expect(screen.getByText('Confirmadas, sem blocos').nextSibling).toHaveTextContent('5 h')
    expect(screen.getByText('Distribuídas').nextSibling).toHaveTextContent('9 h')
    expect(within(rows[2]).getByRole('checkbox')).toBeDisabled() // no plan row, nothing to distribute
  })

  it('blocks a Don name in "o que é" and hours in the window text; nothing is written; the first field gets focus', async () => {
    mount(Agendar)
    fireEvent.click(await screen.findByRole('button', { name: /Editar 3.1-2/ }))
    const what = await screen.findByRole('textbox', { name: /^O que é/ })
    type(what, 'Conduzir com o David')
    type(screen.getByRole('textbox', { name: /^Janela \(texto/ }), 'cerca de 12 h')
    save()
    expect(await screen.findByText(/"David" é da equipe Don/)).toBeInTheDocument()
    expect(screen.getByText(/"12 h" são horas da Don/)).toBeInTheDocument()
    expect(what).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(what).toHaveFocus())
    expect(m.writes).toEqual([])
    // fixing both clears the errors and saves
    type(what, 'Conduzir com a Equipe Don')
    type(screen.getByRole('textbox', { name: /^Janela \(texto/ }), 'primeira quinzena de dezembro')
    save()
    await waitFor(() => expect(m.writes.map((w) => w.table)).toEqual(['to_schedule']))
    expect(m.writes[0].values).toEqual({ what: 'Conduzir com a Equipe Don', window_text: 'primeira quinzena de dezembro' })
  })

  it('hours may be edited freely (Don-only) and save to the plan first; rules: comma, range', async () => {
    mount(Agendar)
    fireEvent.click(await screen.findByRole('button', { name: /Editar 3.1-1/ }))
    const h = await screen.findByRole('textbox', { name: /^Horas/ })
    type(h, '1.000')
    save()
    expect(await screen.findByText(/sem ponto de milhar/)).toBeInTheDocument()
    type(h, '1200')
    save()
    expect(await screen.findByText(/Use um valor de 0 a 1000 h/)).toBeInTheDocument()
    expect(m.writes).toEqual([])
    type(h, '7,5')
    save()
    await waitFor(() => expect(m.writes).toHaveLength(1))
    expect(m.writes[0]).toMatchObject({ table: 'to_schedule_plan', op: 'update', values: { hours: 7.5 }, match: { to_schedule_id: '3.1-1' } })
    await waitFor(() => expect(planOf('3.1-1')).toMatchObject({ hours: 7.5 }))
  })

  it('moving the window dates carries the text Terral reads; typed text is kept', async () => {
    mount(Agendar)
    fireEvent.click(await screen.findByRole('button', { name: /Editar 3.1-2/ }))
    type(await screen.findByLabelText(/^Janela: fim/), '2026-12-18')
    save()
    await waitFor(() => expect(m.writes).toHaveLength(1))
    expect(m.writes[0].values).toEqual({ window_end: '2026-12-18', window_text: 'de 02/11/2026 a 18/12/2026' })

    fireEvent.click(await screen.findByRole('button', { name: /Editar 3.1-2/ }))
    type(await screen.findByLabelText(/^Janela: fim/), '2026-12-22')
    type(screen.getByRole('textbox', { name: /^Janela \(texto/ }), 'a combinar')
    save()
    await waitFor(() => expect(m.writes).toHaveLength(2))
    expect(m.writes[1].values).toEqual({ window_end: '2026-12-22', window_text: 'a combinar' })
  })

  it('refuses a window that ends before it starts and a date outside the project', async () => {
    mount(Agendar)
    fireEvent.click(await screen.findByRole('button', { name: /Editar 3.1-2/ }))
    type(await screen.findByLabelText(/^Janela: fim/), '2026-11-01')
    save()
    expect(await screen.findByText('A janela não pode terminar antes de começar.')).toBeInTheDocument()
    type(screen.getByLabelText(/^Data confirmada/), '2020-01-01')
    save()
    expect(await screen.findByText(/Use uma data do projeto/)).toBeInTheDocument()
    expect(m.writes).toEqual([])
  })

  it('Don can clear a confirmation: confirmed_date goes null and the engine stops flagging it', async () => {
    mount(Agendar, Riscos)
    expect(await screen.findByText(/5 h de 3.1 confirmadas para 12\/11 e ainda sem blocos/)).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /Editar 3.1-1/ }))
    type(await screen.findByLabelText(/^Data confirmada/), '')
    save()
    await waitFor(() => expect(m.writes).toHaveLength(1))
    expect(m.writes[0]).toMatchObject({ table: 'to_schedule', values: { confirmed_date: null }, match: { id: '3.1-1' } })
    await waitFor(() => expect(screen.queryByText(/confirmadas para 12\/11/)).toBeNull())
    await waitFor(() => expect(rowOf('3.1-1')).toMatchObject({ confirmed_date: null }))
  })

  it('Don can change a confirmed date', async () => {
    mount(Agendar)
    fireEvent.click(await screen.findByRole('button', { name: /Editar 3.1-1/ }))
    type(await screen.findByLabelText(/^Data confirmada/), '2026-11-19')
    save()
    await waitFor(() => expect(m.writes).toHaveLength(1))
    expect(m.writes[0].values).toEqual({ confirmed_date: '2026-11-19' })
    expect(await screen.findByText('Confirmada 19/11')).toBeInTheDocument()
  })

  it('the distributed check updates risks and slack at once, offers "Desfazer", and undo puts them back', async () => {
    mount(Agendar, Riscos, Equipe)
    expect(await screen.findByText(/5 h de 3.1 confirmadas para 12\/11 e ainda sem blocos/)).toBeInTheDocument()
    const folga = () => screen.getAllByText('Folga')[1].parentElement! // David (Beto sorts first and has no net capacity)
    expect(folga()).toHaveTextContent('35 h')
    tap(screen.getByRole('checkbox', { name: 'Distribuída: 3.1-1' }))
    await waitFor(() => expect(screen.queryByText(/confirmadas para 12\/11/)).toBeNull())
    expect(m.writes[0]).toMatchObject({ table: 'to_schedule_plan', values: { distributed: true }, match: { to_schedule_id: '3.1-1' } })
    await waitFor(() => expect(folga()).toHaveTextContent('40 h')) // 5 h left "a agendar"; no blocks yet in this fixture
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    expect(await screen.findByText(/5 h de 3.1 confirmadas para 12\/11 e ainda sem blocos/)).toBeInTheDocument()
    await waitFor(() => expect(folga()).toHaveTextContent('35 h'))
    expect(m.writes[1]).toMatchObject({ values: { distributed: false } })
  })

  it('a failed distribute rolls back and says so', async () => {
    m.failOn = ['to_schedule_plan']
    mount(Agendar)
    const box = await screen.findByRole('checkbox', { name: 'Distribuída: 3.1-1' })
    tap(box)
    expect(await screen.findByText('Não salvou. Tente de novo.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Distribuída: 3.1-1' })).not.toBeChecked())
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  })

  it('the switch in the sheet is optimistic too, and a save writes only what changed', async () => {
    mount(Agendar)
    fireEvent.click(await screen.findByRole('button', { name: /Editar 3.1-1/ }))
    const sw = await screen.findByRole('switch', { name: 'Distribuída em blocos' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    save()
    await waitFor(() => expect(m.writes).toHaveLength(1))
    expect(m.writes[0]).toMatchObject({ table: 'to_schedule_plan', values: { distributed: true } })
    await waitFor(() => expect(planOf('3.1-1')).toMatchObject({ distributed: true }))
  })

  it('writes both tables in order, undo restores both; the sheet row follows at once', async () => {
    mount(Agendar)
    fireEvent.click(await screen.findByRole('button', { name: /Editar 3.1-1/ }))
    type(await screen.findByRole('textbox', { name: /^O que é/ }), 'Texto novo')
    type(screen.getByRole('textbox', { name: /^Horas/ }), '6')
    save()
    await waitFor(() => expect(m.writes.map((w) => w.table)).toEqual(['to_schedule_plan', 'to_schedule'])) // Don-only first
    expect(await screen.findByText('Texto novo')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(m.writes).toHaveLength(4))
    await waitFor(() => expect(rowOf('3.1-1')).toMatchObject({ what: 'Agendar 3.1-1' }))
    expect(planOf('3.1-1')).toMatchObject({ hours: 5 })
  })

  it('a failed second write puts the plan row back and keeps the draft', async () => {
    m.failOn = ['to_schedule']
    mount(Agendar)
    fireEvent.click(await screen.findByRole('button', { name: /Editar 3.1-1/ }))
    type(await screen.findByRole('textbox', { name: /^O que é/ }), 'Texto novo')
    type(screen.getByRole('textbox', { name: /^Horas/ }), '6')
    save()
    expect(await screen.findByText('Não salvou. Tente de novo.')).toBeInTheDocument()
    await waitFor(() => expect(m.writes.map((w) => `${w.table}:${w.op}`)).toEqual(['to_schedule_plan:update', 'to_schedule:update', 'to_schedule_plan:update']))
    expect(m.writes[2].values).toEqual({ hours: 5 })
    await waitFor(() => expect(planOf('3.1-1')).toMatchObject({ hours: 5 }))
    expect(rowOf('3.1-1')).toMatchObject({ what: 'Agendar 3.1-1' })
    expect(screen.getByRole('textbox', { name: /^O que é/ })).toHaveValue('Texto novo')
  })

  it('an item with no plan row gets one when hours are typed', async () => {
    mount(Agendar)
    fireEvent.click(await screen.findByRole('button', { name: /Editar 3.1-3/ }))
    type(await screen.findByRole('textbox', { name: /^Horas/ }), '4')
    save()
    await waitFor(() => expect(m.writes).toHaveLength(1))
    expect(m.writes[0]).toMatchObject({ table: 'to_schedule_plan', op: 'insert', values: { to_schedule_id: '3.1-3', hours: 4, distributed: false, person_id: null } })
    expect(await screen.findByRole('checkbox', { name: 'Distribuída: 3.1-3' })).toBeEnabled()
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(m.writes[1]).toMatchObject({ table: 'to_schedule_plan', op: 'delete', match: { to_schedule_id: '3.1-3' } }))
  })
})

describe('Metas (Don)', () => {
  it('lists the goals by level in sheet order, with state in words', async () => {
    mount(Metas)
    const grupo = await screen.findByRole('list', { name: 'Grupo' })
    expect(within(grupo).getAllByRole('listitem')).toHaveLength(2)
    expect(within(grupo).getByText('Métrica 1')).toBeInTheDocument()
    expect(within(grupo).getByText('Definida, sem linha de base')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Vendas · atacado' })).getByText('Ainda não definida')).toBeInTheDocument()
  })

  it('every Terral-visible field is guarded; nothing is written until it is clean', async () => {
    mount(Metas)
    fireEvent.click(await screen.findByRole('button', { name: /Editar meta: Grupo, Suporte 1/ }))
    for (const [label, bad, re] of [
      ['Nível', 'Grupo do David', /"David"/], ['Posição', 'margem', /"margem"/], ['Métrica', 'horas do Lucas', /"Lucas"/],
      ['Ponto de partida', '30 h por semana', /"30 h"/], ['Estado', 'Beto aprovou', /"Beto"/], ['Meta', 'subir a margem', /"margem"/],
    ] as const) {
      const f = await screen.findByRole('textbox', { name: new RegExp(`^${label}`) })
      const was = (f as HTMLInputElement).value
      type(f, bad)
      save()
      expect(await screen.findByText(re)).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: new RegExp(`^${label}`) })).toHaveAttribute('aria-invalid', 'true')
      expect(m.writes).toEqual([])
      type(screen.getByRole('textbox', { name: new RegExp(`^${label}`) }), was)
    }
  })

  it('required fields and the order get inline errors', async () => {
    mount(Metas)
    fireEvent.click(await screen.findByRole('button', { name: /Editar meta: Grupo, Suporte 2/ }))
    type(await screen.findByRole('textbox', { name: /^Métrica/ }), ' ')
    type(screen.getByRole('textbox', { name: /^Ordem/ }), '1,5')
    save()
    expect(await screen.findByText('Escreva a métrica.')).toBeInTheDocument()
    expect(screen.getByText('Use um número inteiro.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox', { name: /^Métrica/ })).toHaveFocus())
    expect(m.writes).toEqual([])
  })

  it('saves only what changed, shows it at once, empty optional fields become null, and undo restores', async () => {
    mount(Metas)
    fireEvent.click(await screen.findByRole('button', { name: /Editar meta: Grupo, Suporte 1/ }))
    type(await screen.findByRole('textbox', { name: /^Meta/ }), 'Chegar a 70%')
    type(screen.getByRole('textbox', { name: /^Ponto de partida/ }), '')
    type(screen.getByRole('textbox', { name: /^Estado/ }), 'Meta definida')
    save()
    await waitFor(() => expect(m.writes).toHaveLength(1))
    expect(m.writes[0]).toMatchObject({ table: 'goal', op: 'update', match: { id: 'g1' }, values: { target: 'Chegar a 70%', baseline: null, state: 'Meta definida' } })
    expect(await screen.findByText('Meta definida')).toBeInTheDocument()
    expect(screen.getByText('Meta: Chegar a 70%')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(m.writes).toHaveLength(2))
    expect(m.writes[1].values).toEqual({ target: null, baseline: '56%', state: 'Linha de base apurada' })
    await waitFor(() => expect(m.db.goal.find((g) => g.id === 'g1')).toMatchObject({ target: null, baseline: '56%', state: 'Linha de base apurada' }))
  })

  it('changing the order moves the goal inside its level', async () => {
    mount(Metas)
    fireEvent.click(await screen.findByRole('button', { name: /Editar meta: Grupo, Suporte 1/ }))
    type(await screen.findByRole('textbox', { name: /^Ordem/ }), '9')
    save()
    await waitFor(() => expect(m.writes[0]).toMatchObject({ values: { sort: 9 } }))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Grupo' })).getAllByRole('listitem')[0]).toHaveTextContent('Métrica 2'))
  })

  it('a failed save rolls the row back and keeps the draft', async () => {
    m.failOn = ['goal']
    mount(Metas)
    fireEvent.click(await screen.findByRole('button', { name: /Editar meta: Grupo, Suporte 1/ }))
    type(await screen.findByRole('textbox', { name: /^Métrica/ }), 'Outra métrica')
    save()
    expect(await screen.findByText('Não salvou. Tente de novo.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox', { name: /^Métrica/ })).toHaveValue('Outra métrica'))
    expect(m.db.goal.find((g) => g.id === 'g1')).toMatchObject({ metric: 'Métrica 1' })
    expect(within(screen.getByRole('list', { name: 'Grupo' })).getByText('Métrica 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  })
})
