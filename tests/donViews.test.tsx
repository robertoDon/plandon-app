// @vitest-environment jsdom
// Don Riscos, Pendências, Decisões, Equipe: the Terral guard, the locked X-item switch, undo, decision rules, capacity.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../src/domain/types'

type Rows = Record<string, Record<string, unknown>[]>
type Write = { table: string; op: string; values: unknown; match?: Record<string, unknown> }

const mock = vi.hoisted(() => {
  const m = { db: {} as Rows, writes: [] as Write[], fail: false, failOn: [] as string[], profile: null as unknown as Profile }
  const read = (t: string) => {
    const p = Promise.resolve().then(() => ({ data: structuredClone(m.db[t] ?? []), error: null })) as Promise<unknown> & Record<string, unknown>
    p.order = () => p
    p.limit = () => p
    return p
  }
  const done = async (t: string, op: string, values: unknown, match: Record<string, unknown> | undefined, apply: (db: Rows) => void) => {
    m.writes.push({ table: t, op, values, match })
    const db = m.db // the fixture of this test: a write still in flight at the end of a test must not touch the next one
    const fails = m.fail || m.failOn.includes(t) // decided now: a write in flight when a test ends must not see the next test's flags
    await new Promise((r) => setTimeout(r, 10))
    if (fails) return { data: null, error: { message: 'boom' } }
    apply(db)
    return { data: [], error: null }
  }
  const supabase = {
    from: (t: string) => ({
      select: () => read(t),
      insert: (v: Record<string, unknown>) => ({ select: () => done(t, 'insert', v, undefined, (db) => (db[t] ??= []).push({ ...v })) }),
      upsert: (v: Record<string, unknown>) => ({
        select: () => done(t, 'upsert', v, undefined, (db) => {
          const rows = (db[t] ??= [])
          const row = rows.find((r) => r.code === v.code)
          if (row) Object.assign(row, v)
          else rows.push({ ...v })
        }),
      }),
      update: (v: Record<string, unknown>) => ({
        match: (match: Record<string, unknown>) => ({
          select: () => done(t, 'update', v, match, (db) => {
            for (const r of db[t] ?? []) if (Object.entries(match).every(([k, x]) => r[k] === x)) Object.assign(r, v)
          }),
        }),
      }),
    }),
  }
  return { m, supabase }
})
vi.mock('../src/lib/supabase', () => ({ supabase: mock.supabase }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ profile: mock.m.profile }) }))

const { ToastProvider } = await import('../src/ui')
const { default: Pendencias } = await import('../src/views/don/Pendencias')
const { default: Decisoes } = await import('../src/views/don/Decisoes')
const { default: Equipe } = await import('../src/views/don/Equipe')
const { default: Riscos } = await import('../src/views/don/Riscos')
const { m } = mock

beforeAll(() => {
  const p = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void }
  p.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  p.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
})

const block = (id: string, date: string, hours: number, o: Record<string, unknown> = {}) => ({
  id, date, week: 'S03', type: 'Tarefa', front: 'Vendas', code: '3.1', description: `Tarefa ${id}`, person_id: 'david', hours, due: null, task_id: null, done: false, done_at: null, ...o,
})
const item = (code: string, o: Record<string, unknown> = {}) => ({
  code, kind: 'pendencia', text: `Item ${code}`, owner_public: 'Terral', due: '2026-11-20', due_text: null, effect: null, status: 'open', visible_to_terral: true, ...o,
})

function fixture(): Rows {
  return {
    person: [
      { id: 'david', name: 'David', net_capacity_h: 40, reserved_h: 0, daily_cap_h: 8, weekly_cap_h: 40 },
      { id: 'beto', name: 'Beto', net_capacity_h: null, reserved_h: 0, daily_cap_h: 8, weekly_cap_h: 40 },
    ],
    block: [
      block('b1', '2026-11-11', 6, { done: true }),
      block('b2', '2026-11-12', 4),
      block('p1', '2026-11-05', 3.5, { code: 'D01', description: 'Preparar D01' }),
    ],
    to_schedule_plan: [{ to_schedule_id: 'x-1', person_id: 'david', hours: 5, distributed: false }, { to_schedule_id: 'x-2', person_id: 'david', hours: 9, distributed: true }],
    deliverable: [{ code: '3.1', name: 'Segmentação', front: 'Vendas', in_use_start: null, in_use_at: null, built_date: null, in_use_end: null, built_at: null, published_flag: null }],
    open_item: [
      item('P-01', { text: 'Base de vendas pendente' }),
      item('P-02', { text: 'Contrato assinado', visible_to_terral: false, owner_public: 'Equipe Don' }),
      item('X-01', { kind: 'divergencia', text: 'Total não fecha', visible_to_terral: false, owner_public: 'Equipe Don' }),
    ],
    open_item_internal: [{ code: 'P-01', owner_raw: 'Terral' }, { code: 'P-02', owner_raw: 'David' }, { code: 'X-01', owner_raw: 'Lucas' }],
    decision: [
      { code: 'D01', title: 'Escolher o modelo', date: '2026-11-20', prepared_on: '2026-11-05', status: 'pending', outcome: null, decided_by: null, decided_at: null },
      { code: 'D02', title: 'Aprovar o escopo', date: '2026-10-01', prepared_on: null, status: 'decided', outcome: 'Aprovado', decided_by: 'Diretoria Terral', decided_at: '2026-10-01' },
    ],
    manual_risk: [{ id: 'm1', title: 'Fornecedor atrasado', severity: 'medium', links: ['3.1'], person_id: null, status: 'open', note: null, created_by: null }],
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

beforeEach(() => {
  m.db = fixture()
  m.writes = []
  m.fail = false
  m.failOn = []
  m.profile = don
})
afterEach(cleanup)

describe('Pendências', () => {
  it('lists P-items by code with status; X-items sit in the other segment', async () => {
    mount(Pendencias)
    const list = await screen.findByRole('list', { name: 'Pendências' })
    expect(within(list).getAllByRole('listitem').map((li) => li.querySelector('.don-code')?.textContent)).toEqual(['P-01', 'P-02'])
    expect(within(list).queryByText('Total não fecha')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /Divergências/ }))
    expect(await screen.findByText('Total não fecha')).toBeInTheDocument()
  })

  it('blocks saving "David" into a visible item, shows the message and keeps the sheet open', async () => {
    mount(Pendencias)
    fireEvent.click(await screen.findByRole('button', { name: /Editar P-01/ }))
    const text = await screen.findByRole('textbox', { name: /^Texto/ })
    type(text, 'Fala com o David')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText(/"David" é da equipe Don/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Texto/ })).toHaveAttribute('aria-invalid', 'true')
    expect(m.writes).toEqual([])
    // fixing the text clears the error and saves
    type(screen.getByRole('textbox', { name: /^Texto/ }), 'Fala com a Equipe Don')
    expect(screen.queryByText(/é da equipe Don/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(m.writes).toHaveLength(1))
    expect(m.writes[0]).toMatchObject({ table: 'open_item', match: { code: 'P-01' }, values: { text: 'Fala com a Equipe Don' } })
  })

  it('blocks hours and "margem" in the effect of a visible item', async () => {
    mount(Pendencias)
    fireEvent.click(await screen.findByRole('button', { name: /Editar P-01/ }))
    type(await screen.findByRole('textbox', { name: /^Efeito/ }), 'custa 21,0 h')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText(/"21,0 h"/)).toBeInTheDocument()
    expect(m.writes).toEqual([])
  })

  it('a Don-only item may name David until it is made visible', async () => {
    mount(Pendencias)
    fireEvent.click(await screen.findByRole('button', { name: /Editar P-02/ }))
    type(await screen.findByRole('textbox', { name: /^Texto/ }), 'Fala com o David')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(m.writes).toHaveLength(1))
    expect(m.writes[0].values).toMatchObject({ visible_to_terral: false })
    // now turn it visible: the guard reads the same text and blocks
    fireEvent.click(await screen.findByRole('button', { name: /Editar P-02/ }))
    fireEvent.click(await screen.findByRole('switch', { name: 'Visível para a Terral' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText(/"David"/)).toBeInTheDocument()
    expect(m.writes).toHaveLength(1)
  })

  it('an X-item switch is locked off', async () => {
    mount(Pendencias)
    fireEvent.click(await screen.findByRole('radio', { name: /Divergências/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Editar X-01/ }))
    const sw = await screen.findByRole('switch', { name: 'Visível para a Terral' })
    expect(sw).toBeDisabled()
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'false')
  })

  it('saves owner_raw to the Don-only table', async () => {
    mount(Pendencias)
    fireEvent.click(await screen.findByRole('button', { name: /Editar P-02/ }))
    type(await screen.findByRole('textbox', { name: /Responsável de verdade/ }), 'Roberto')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(m.writes.map((w) => w.table)).toEqual(['open_item_internal', 'open_item'])) // Don-only first
    expect(m.writes.find((w) => w.table === 'open_item_internal')).toMatchObject({ op: 'upsert', values: { code: 'P-02', owner_raw: 'Roberto' } })
  })

  it('a failed second write leaves nothing half-saved: owner_raw goes first and is put back', async () => {
    m.failOn = ['open_item']
    mount(Pendencias)
    fireEvent.click(await screen.findByRole('button', { name: /Editar P-02/ }))
    type(await screen.findByRole('textbox', { name: /Responsável de verdade/ }), 'Roberto')
    type(screen.getByRole('textbox', { name: /^Texto/ }), 'Texto novo')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Não salvou. Tente de novo.')).toBeInTheDocument()
    await waitFor(() => expect(m.writes.map((w) => `${w.table}:${w.op}`)).toEqual(['open_item_internal:upsert', 'open_item:update', 'open_item_internal:upsert']))
    expect(m.writes[0].values).toMatchObject({ owner_raw: 'Roberto' })
    expect(m.writes[2].values).toMatchObject({ owner_raw: 'David' }) // compensation
    await waitFor(() => expect(m.db.open_item_internal.find((r) => r.code === 'P-02')).toMatchObject({ owner_raw: 'David' }))
    expect(m.db.open_item.find((r) => r.code === 'P-02')).toMatchObject({ text: 'Contrato assinado' })
    // the sheet is still open with the draft
    expect(screen.getByRole('textbox', { name: /^Texto/ })).toHaveValue('Texto novo')
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
  })

  it('missing required fields get an inline error tied to the field, and focus goes to the first', async () => {
    mount(Pendencias)
    fireEvent.click(await screen.findByRole('button', { name: /Editar P-01/ }))
    type(await screen.findByRole('textbox', { name: /^Texto/ }), '')
    type(screen.getByRole('textbox', { name: /^Responsável \(como/ }), '')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    const text = await screen.findByRole('textbox', { name: /^Texto/ })
    await waitFor(() => expect(text).toHaveFocus())
    expect(text).toHaveAttribute('aria-invalid', 'true')
    const msg = screen.getByText('Escreva o texto.')
    expect(text.getAttribute('aria-describedby')).toBe(msg.id)
    expect(screen.getByText('Diga quem é o responsável.')).toBeInTheDocument()
    expect(m.writes).toEqual([])
  })

  it('resolving ticks at once, offers "Desfazer", and undo reopens', async () => {
    mount(Pendencias)
    const box = await screen.findByRole('checkbox', { name: 'Resolver P-01' })
    expect(box).not.toBeChecked()
    tap(box)
    await waitFor(() => expect(box).toBeChecked())
    expect(m.writes[0]).toMatchObject({ table: 'open_item', values: { status: 'resolved' }, match: { code: 'P-01' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(m.writes[1]).toMatchObject({ values: { status: 'open' } }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Resolver P-01' })).not.toBeChecked())
  })

  it('a failed resolve rolls back and says so', async () => {
    m.fail = true
    mount(Pendencias)
    const box = await screen.findByRole('checkbox', { name: 'Resolver P-01' })
    tap(box)
    expect(await screen.findByText('Não salvou. Tente de novo.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Resolver P-01' })).not.toBeChecked())
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  })
})

describe('Decisões', () => {
  it('lists decisions with status and the prep hours of the blocks coded to it', async () => {
    mount(Decisoes)
    const d1 = (await screen.findByRole('button', { name: /Editar D01/ })).closest('li')!
    expect(d1).toHaveTextContent('preparação 3,5 h')
    expect(d1).toHaveTextContent('preparar até 05/11')
    expect(d1).toHaveTextContent('Pendente')
    expect(screen.getByRole('button', { name: /Editar D02/ }).closest('li')).toHaveTextContent('Aprovado')
  })

  it('"Decidida" requires the outcome', async () => {
    mount(Decisoes)
    fireEvent.click(await screen.findByRole('button', { name: /Editar D01/ }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Decidida' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    const msg = await screen.findByText('Escreva o resultado da decisão.')
    const outcome = screen.getByRole('textbox', { name: /^Resultado/ })
    expect(outcome).toHaveAttribute('aria-invalid', 'true')
    expect(outcome.getAttribute('aria-describedby')).toBe(msg.id)
    await waitFor(() => expect(outcome).toHaveFocus())
    expect(m.writes).toEqual([])
    type(screen.getByRole('textbox', { name: /^Resultado/ }), 'Modelo B')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Diga quem decidiu.')).toBeInTheDocument()
    type(screen.getByRole('textbox', { name: /^Quem decidiu/ }), 'Diretoria Terral')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(m.writes).toHaveLength(1))
    expect(m.writes[0].values).toMatchObject({ status: 'decided', outcome: 'Modelo B', decided_by: 'Diretoria Terral', decided_at: '2026-11-10' })
  })

  it('the decision title and outcome pass the Terral guard', async () => {
    mount(Decisoes)
    fireEvent.click(await screen.findByRole('button', { name: /Editar D01/ }))
    type(await screen.findByRole('textbox', { name: /^Título/ }), 'O David escolhe o modelo')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText(/"David"/)).toBeInTheDocument()
    expect(m.writes).toEqual([])
  })
})

describe('Equipe e carga', () => {
  it('shows planned, done, a agendar and slack per person', async () => {
    mount(Equipe)
    const card = (await screen.findByRole('region', { name: 'David' }))
    const stat = (name: string) => within(card).getByText(name).parentElement!
    expect(stat('Planejado')).toHaveTextContent('13,5 h') // 6 + 4 + 3.5
    expect(stat('Feito')).toHaveTextContent('6 h')
    expect(stat('A agendar')).toHaveTextContent('5 h') // the distributed 9 h is already in blocks
    expect(stat('Folga')).toHaveTextContent('21,5 h')
  })

  it('editing the net capacity changes the slack at once; bad values are refused', async () => {
    mount(Equipe)
    const card = await screen.findByRole('region', { name: 'David' })
    const slack = () => within(card).getByText('Folga').parentElement!
    // planned 6 + 4 + 3.5 = 13.5, a agendar 5 (the distributed 9 does not count): 40 - 13.5 - 5 = 21.5
    expect(slack()).toHaveTextContent('21,5 h')
    const net = within(card).getByRole('textbox', { name: 'Capacidade líquida' })
    type(net, '-3')
    fireEvent.blur(net)
    expect(within(card).getByText(/Digite um número/)).toBeInTheDocument()
    type(net, '9999')
    fireEvent.blur(net)
    expect(within(card).getByText(/Use um valor de 0 a 2000/)).toBeInTheDocument()
    expect(m.writes).toEqual([])
    type(net, '30,5')
    fireEvent.keyDown(net, { key: 'Enter' })
    await waitFor(() => expect(slack()).toHaveTextContent('12 h'))
    expect(m.writes[0]).toMatchObject({ table: 'person', values: { net_capacity_h: 30.5 }, match: { id: 'david' } })
  })

  it('caps need at least 1 h, and the day cap cannot pass the week cap', async () => {
    mount(Equipe)
    const card = await screen.findByRole('region', { name: 'David' })
    const day = within(card).getByRole('textbox', { name: 'Limite por dia' })
    const week = within(card).getByRole('textbox', { name: 'Limite por semana' })
    type(day, '0')
    fireEvent.blur(day)
    expect(within(card).getByText('Use um valor de 1 a 24 h.')).toBeInTheDocument()
    type(week, '5') // below the day cap (8)
    fireEvent.blur(week)
    expect(within(card).getByText(/não pode ser menor que o limite por dia \(8 h\)/)).toBeInTheDocument()
    type(day, '12') // above the week cap (40 is fine; 12 passes)
    fireEvent.blur(day)
    await waitFor(() => expect(m.writes).toHaveLength(1))
    expect(m.writes[0].values).toEqual({ daily_cap_h: 12 })
    type(day, '24')
    fireEvent.blur(day)
    await waitFor(() => expect(m.writes).toHaveLength(2))
    type(week, '16')
    fireEvent.blur(week)
    expect(within(card).getAllByText(/não pode ser menor/).length).toBeGreaterThan(0)
    expect(m.writes).toHaveLength(2)
  })

  it('"1.000" is refused (ambiguous), "7.5" and "7,5" are accepted', async () => {
    mount(Equipe)
    const card = await screen.findByRole('region', { name: 'David' })
    const net = within(card).getByRole('textbox', { name: 'Capacidade líquida' })
    type(net, '1.000')
    fireEvent.blur(net)
    expect(within(card).getByText(/Escreva sem ponto de milhar/)).toBeInTheDocument()
    expect(m.writes).toEqual([])
    type(net, '7.5')
    fireEvent.blur(net)
    await waitFor(() => expect(m.writes).toHaveLength(1))
    expect(m.writes[0].values).toEqual({ net_capacity_h: 7.5 })
    type(net, '1.000,5')
    fireEvent.blur(net)
    expect(within(card).getByText(/Digite um número/)).toBeInTheDocument()
  })

  it('a failed capacity save rolls the number back', async () => {
    m.fail = true
    mount(Equipe)
    const card = await screen.findByRole('region', { name: 'David' })
    const net = within(card).getByRole('textbox', { name: 'Capacidade líquida' })
    type(net, '30')
    fireEvent.blur(net)
    expect(await screen.findByText('Não salvou. Tente de novo.')).toBeInTheDocument()
    await waitFor(() => expect(within(card).getByRole('textbox', { name: 'Capacidade líquida' })).toHaveValue('40'))
  })

  it('lists the days and weeks over the cap', async () => {
    m.db.person[0].weekly_cap_h = 8
    mount(Equipe)
    const card = await screen.findByRole('region', { name: 'David' })
    expect(await within(card).findByText(/David: 13,5 h na semana S03 \(limite 8 h\)/)).toBeInTheDocument()
  })

  it('lowering a cap re-ranks the risks list at once (shared cache)', async () => {
    mount(Equipe, Riscos)
    const card = await screen.findByRole('region', { name: 'David' })
    await screen.findByText('Fornecedor atrasado')
    expect(screen.queryByText(/na semana S03/, { selector: '.t' })).toBeNull()
    const weekly = within(card).getByRole('textbox', { name: 'Limite por semana' })
    type(weekly, '8')
    fireEvent.blur(weekly)
    await waitFor(() => expect(document.querySelector('.don-risk .t')?.textContent ?? '').toContain('na semana S03'))
  })
})

describe('Riscos', () => {
  it('lists the manual risk with the automatic ones; filters by source', async () => {
    mount(Riscos)
    expect(await screen.findByText('Fornecedor atrasado')).toBeInTheDocument()
    expect(screen.getByText(/3.1 sem data de uso/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Manuais' }))
    expect(document.querySelectorAll('.don-risk')).toHaveLength(1)
    fireEvent.click(screen.getByRole('radio', { name: 'Automáticos' }))
    expect(screen.queryByText('Fornecedor atrasado')).toBeNull()
  })

  it('a new manual risk appears at once and is inserted', async () => {
    mount(Riscos)
    fireEvent.click(await screen.findByRole('button', { name: 'Novo risco' }))
    type(await screen.findByRole('textbox', { name: /^Título/ }), 'Cliente sem acesso à base')
    type(screen.getByRole('textbox', { name: 'Entregas afetadas' }), '9.9')
    fireEvent.click(screen.getByRole('button', { name: 'Criar risco' }))
    expect(await screen.findByText(/Não existe entrega com o código 9.9/)).toBeInTheDocument()
    type(screen.getByRole('textbox', { name: 'Entregas afetadas' }), '3.1')
    fireEvent.click(screen.getAllByRole('radio', { name: 'Crítico' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: 'Criar risco' }))
    expect(await screen.findByText('Cliente sem acesso à base')).toBeInTheDocument()
    await waitFor(() => expect(m.writes).toHaveLength(1))
    expect(m.writes[0]).toMatchObject({ table: 'manual_risk', op: 'insert', values: { title: 'Cliente sem acesso à base', severity: 'high', links: ['3.1'] } })
    expect(m.writes[0].values).not.toHaveProperty('created_by')
  })

  it('"Encerrar" closes a manual risk, with undo', async () => {
    mount(Riscos)
    fireEvent.click(await screen.findByRole('button', { name: /Encerrar: Fornecedor atrasado/ }))
    await waitFor(() => expect(screen.queryByText('Fornecedor atrasado', { selector: '.t' })).toBeNull())
    expect(m.writes[0]).toMatchObject({ table: 'manual_risk', values: { status: 'closed' }, match: { id: 'm1' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(m.writes[1]).toMatchObject({ values: { status: 'open' } }))
    expect(await screen.findByText('Fornecedor atrasado')).toBeInTheDocument()
  })
})
