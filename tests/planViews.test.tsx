// @vitest-environment jsdom
// Don Entregas, the deliverable detail, Calendário and Histórico: optimistic writes with undo, task/block CRUD,
// dependencies (cycle refused), the Terral guard on the published note, calendar filters, one shared cache for
// calendar + risks, history pages.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../src/domain/types'

type R = Record<string, unknown>
type Rows = Record<string, R[]>
type Write = { table: string; op: string; values: unknown; match?: R }
type Read = { table: string; ops: string[] }

const mock = vi.hoisted(() => {
  const m = {
    db: {} as Rows, writes: [] as Write[], reads: [] as Read[], failOn: [] as string[], gate: null as Promise<void> | null,
    profile: null as unknown as import('../src/domain/types').Profile,
  }
  const matches = (r: R, w: R) => Object.entries(w).every(([k, v]) => r[k] === v)
  const query = (t: string) => {
    const ops: ((rs: R[]) => R[])[] = []
    const seen: Read = { table: t, ops: [] }
    m.reads.push(seen)
    const q: R & PromiseLike<unknown> = {
      eq: (c: string, v: unknown) => (seen.ops.push(`eq ${c} ${v}`), ops.push((rs) => rs.filter((r) => r[c] === v)), q),
      is: (c: string, v: unknown) => (seen.ops.push(`is ${c} ${v}`), ops.push((rs) => rs.filter((r) => r[c] === v)), q),
      lt: (c: string, v: number) => (seen.ops.push(`lt ${c} ${v}`), ops.push((rs) => rs.filter((r) => (r[c] as number) < v)), q),
      order: (c: string, o?: { ascending?: boolean }) =>
        (ops.push((rs) => [...rs].sort((a, b) => ((a[c] as number) < (b[c] as number) ? -1 : 1) * (o?.ascending === false ? -1 : 1))), q),
      limit: (n: number) => (ops.push((rs) => rs.slice(0, n)), q),
      range: (a: number, b: number) => (seen.ops.push(`range ${a} ${b}`), ops.push((rs) => rs.slice(a, b + 1)), q),
      then: (res, rej) =>
        Promise.resolve().then(() => ({ data: ops.reduce((rs, f) => f(rs), structuredClone(m.db[t] ?? [])), error: null })).then(res, rej),
    }
    return q
  }
  const done = async (t: string, op: string, values: unknown, match: R | undefined, apply: (db: Rows) => void) => {
    m.writes.push({ table: t, op, values, match })
    const db = m.db
    const fails = m.failOn.includes(t)
    const gate = m.gate
    await new Promise((r) => setTimeout(r, 5))
    if (gate) await gate
    if (fails) return { data: null, error: { message: 'boom' } }
    apply(db)
    return { data: [], error: null }
  }
  const supabase = {
    from: (t: string) => ({
      select: () => query(t),
      insert: (v: R | R[]) => ({ select: () => done(t, 'insert', v, undefined, (db) => (db[t] ??= []).push(...structuredClone([v].flat()))) }),
      update: (v: R) => ({ match: (w: R) => ({ select: () => done(t, 'update', v, w, (db) => (db[t] ?? []).filter((r) => matches(r, w)).forEach((r) => Object.assign(r, v))) }) }),
      delete: () => ({ match: (w: R) => ({ select: () => done(t, 'delete', undefined, w, (db) => (db[t] = (db[t] ?? []).filter((r) => !matches(r, w)))) }) }),
    }),
    storage: { from: () => ({}) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  }
  return { m, supabase }
})
vi.mock('../src/lib/supabase', () => ({ supabase: mock.supabase }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ profile: mock.m.profile }) }))

const { ToastProvider } = await import('../src/ui')
const { default: Entregas } = await import('../src/views/don/Entregas')
const { default: Entrega } = await import('../src/views/don/Entrega')
const { default: Calendario } = await import('../src/views/don/Calendario')
const { default: Riscos } = await import('../src/views/don/Riscos')
const { default: Historico } = await import('../src/views/don/Historico')
const { m } = mock

beforeAll(() => {
  const p = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void }
  p.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  p.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
})

const block = (id: string, date: string, hours: number, o: R = {}): R => ({
  id, date, week: 'S03', type: 'Tarefa', front: 'Vendas', code: '3.1', description: `Bloco ${id}`, person_id: 'david', hours, due: null, task_id: 't1', done: false, done_at: null, ...o,
})
const dlv = (code: string, name: string, o: R = {}): R => ({
  code, name, front: 'Vendas', origin: 'escopo2', built_date: '2026-12-01', in_use_start: '2026-12-10', in_use_end: '2026-12-10', in_use_text: null,
  in_use_confirmed: false, built_at: null, in_use_at: null, target_ritual: 'Comitê', terral_owner: 'Gerente comercial', published_flag: null, sort: 0, ...o,
})

function fixture(): Rows {
  return {
    person: [
      { id: 'david', name: 'David', net_capacity_h: null, reserved_h: 0, daily_cap_h: 8, weekly_cap_h: 40 },
      { id: 'lucas', name: 'Lucas', net_capacity_h: null, reserved_h: 0, daily_cap_h: 8, weekly_cap_h: 40 },
    ],
    deliverable: [
      dlv('3.10', 'Painel de metas'), dlv('3.2', 'Matriz de preço'), dlv('I2', 'Instrumento dois', { origin: 'instrumento' }), dlv('3.1', 'Segmentação'),
    ],
    task: [{ id: 't1', sort: 1, due: '2026-12-01', kind: 'task', front: 'Vendas', code: '3.1', description: 'Montar o modelo', person_id: 'david', status: 'in_progress' }],
    block: [
      block('b1', '2026-11-12', 6, { done: true }),
      block('b2', '2026-11-12', 4, { description: 'Revisar o modelo' }),
      block('b3', '2026-11-12', 2, { person_id: 'lucas', type: 'Rito', code: null, task_id: null, description: 'Reunião de time' }),
    ],
    dependency: [
      { id: 'dep1', from_kind: 'deliverable', from_ref: '3.1', to_code: '3.2', suggested: false },
      { id: 'dep2', from_kind: 'open_item', from_ref: 'P-01', to_code: '3.1', suggested: true },
    ],
    open_item: [{ code: 'P-01', kind: 'pendencia', text: 'Base de vendas', owner_public: 'Terral', due: null, due_text: null, effect: null, status: 'open', visible_to_terral: true }],
    decision: [], to_schedule: [], to_schedule_plan: [], open_item_internal: [], goal: [], ritual: [], ritual_occurrence: [], manual_risk: [], comment: [], evidence: [],
    traceability: [{ id: 'tr1', annex_tab: 'Alertas', field: 'Ação padrão', col: 'C', n: 7, deliverable_code: '3.1', task_description: 'Definir a ação', filled_by: 'Don estrutura' }],
    profiles: [{ id: 'u1', display_name: 'Beto Teixeira', role: 'don', status: 'approved', person_id: null, must_change_password: false }],
    history: Array.from({ length: 60 }, (_, i) => ({
      id: i + 1, table_name: i % 2 ? 'block' : 'deliverable', row_ref: i % 2 ? 'b1' : '3.1', action: 'UPDATE',
      old: { hours: i }, new: { hours: i + 1 }, user_id: 'u1', at: `2026-11-${String(1 + Math.floor(i / 10)).padStart(2, '0')}T15:00:00Z`,
    })),
  }
}

const don: Profile = { id: 'u1', display_name: 'Beto Teixeira', role: 'don', status: 'approved', person_id: null, must_change_password: false }

function mount(path: string, el: React.ReactNode) {
  window.history.replaceState({}, '', '/?today=2026-11-10')
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <Routes>
            <Route path="/don/entregas" element={<Entregas />} />
            <Route path="/don/entregas/:code" element={el ?? <Entrega />} />
            <Route path="*" element={el} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const detail = () => mount('/don/entregas/3.1', <Entrega />)
const tap = (el: HTMLElement) => {
  fireEvent.pointerDown(el, { buttons: 1 })
  fireEvent.click(el)
}
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } })
const sheet = () => screen.getAllByRole('dialog').find((x) => x.hasAttribute('open'))!
const writesOf = (t: string) => m.writes.filter((w) => w.table === t)
const release = () => { let r!: () => void; m.gate = new Promise<void>((x) => (r = x)); return () => { m.gate = null; r() } }

beforeEach(() => {
  m.db = fixture()
  m.writes = []
  m.reads = []
  m.failOn = []
  m.gate = null
  m.profile = don
  vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => 'new-uuid' })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Entregas', () => {
  it('lists by code in natural order (3.1 < 3.2 < 3.10, instruments last) with health, progress and next date', async () => {
    mount('/don/entregas', null)
    const esc = await screen.findByRole('list', { name: 'Escopo 2' })
    expect(within(esc).getAllByRole('link').map((a) => a.querySelector('.don-code')?.textContent)).toEqual(['3.1', '3.2', '3.10'])
    expect(within(screen.getByRole('list', { name: 'Instrumentos' })).getByText('I2')).toBeInTheDocument()
    const row = within(esc).getAllByRole('link')[0]
    expect(row).toHaveAttribute('href', '/don/entregas/3.1')
    expect(within(row).getByLabelText('Progresso de 3.1: 6 h de 10 h')).toBeInTheDocument()
    expect(within(row).getByText(/Construção 01\/12/)).toBeInTheDocument()
    expect(within(row).getByText('No prazo')).toBeInTheDocument()
  })
})

describe('Entrega: header toggles', () => {
  it('Construído flips at once, saves today, and Desfazer writes the old value back', async () => {
    detail()
    const sw = await screen.findByRole('switch', { name: 'Construído' })
    const open = release()
    fireEvent.click(sw)
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true')) // the server has not answered yet
    expect(writesOf('deliverable')[0]).toMatchObject({ op: 'update', values: { built_at: '2026-11-10' }, match: { code: '3.1' } })
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(writesOf('deliverable')[1]).toMatchObject({ values: { built_at: null } }))
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Construído' })).toHaveAttribute('aria-checked', 'false'))
  })

  it('a failed toggle rolls back and says so', async () => {
    m.failOn = ['deliverable']
    detail()
    const sw = await screen.findByRole('switch', { name: 'Em uso' })
    const open = release()
    fireEvent.click(sw)
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'))
    open()
    expect(await screen.findByText('Não salvou. Tente de novo.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Em uso' })).toHaveAttribute('aria-checked', 'false')
  })
})

describe('Entrega: published note', () => {
  it('the guard blocks "David" inline, keeps focus on the note and writes nothing', async () => {
    detail()
    fireEvent.click(await screen.findByRole('switch', { name: 'Publicar atenção' }))
    const note = screen.getByLabelText('Nota que a Terral lê')
    type(note, 'David está sem tempo esta semana')
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))
    expect(await screen.findByText(/"David" é da equipe Don/)).toBeInTheDocument()
    expect(note).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(note).toHaveFocus())
    expect(writesOf('deliverable')).toHaveLength(0)
    type(note, 'A base de vendas atrasou')
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))
    await waitFor(() => expect(writesOf('deliverable')[0]).toMatchObject({ values: { published_flag: 'A base de vendas atrasou' } }))
  })

  it('the deliverable name is guarded too', async () => {
    detail()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    type(within(sheet()).getByLabelText(/^Nome/), 'Segmentação do Lucas')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Salvar' }))
    expect(await within(sheet()).findByText(/"Lucas" é da equipe Don/)).toBeInTheDocument()
    expect(writesOf('deliverable')).toHaveLength(0)
  })
})

describe('Entrega: tasks and blocks', () => {
  it('creates a task with the deliverable code and a fresh uuid', async () => {
    detail()
    fireEvent.click(await screen.findByRole('button', { name: 'Nova tarefa' }))
    type(within(sheet()).getByLabelText(/O que precisa ser feito/), 'Validar com a diretoria')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Criar tarefa' }))
    await waitFor(() => expect(writesOf('task')[0]).toMatchObject({ op: 'insert', values: { id: 'new-uuid', code: '3.1', front: 'Vendas', description: 'Validar com a diretoria', sort: 2 } }))
    expect(await screen.findByRole('button', { name: 'Editar tarefa: Validar com a diretoria' })).toBeInTheDocument()
  })

  it('edits a block: only changed fields, the id kept, the week follows the date; Desfazer restores', async () => {
    detail()
    fireEvent.click(await screen.findByRole('button', { name: /Ver 2 blocos/ }))
    fireEvent.click(screen.getByRole('button', { name: /Editar bloco de 12\/11: Revisar o modelo/ }))
    type(within(sheet()).getByLabelText(/^Data/), '2026-11-19')
    type(within(sheet()).getByLabelText(/^Horas/), '2,5')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(writesOf('block')[0]).toMatchObject({ op: 'update', values: { date: '2026-11-19', week: 'S04', hours: 2.5 }, match: { id: 'b2' } }))
    expect(Object.keys(writesOf('block')[0].values as R).sort()).toEqual(['date', 'hours', 'week'])
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(writesOf('block')[1]).toMatchObject({ values: { date: '2026-11-12', week: 'S03', hours: 4 }, match: { id: 'b2' } }))
  })

  it('refuses bad hours inline ("1.000") and a date outside the project', async () => {
    detail()
    fireEvent.click(await screen.findByRole('button', { name: /Ver 2 blocos/ }))
    fireEvent.click(screen.getByRole('button', { name: /Editar bloco de 12\/11: Revisar o modelo/ }))
    type(within(sheet()).getByLabelText(/^Horas/), '1.000')
    type(within(sheet()).getByLabelText(/^Data/), '2027-09-01')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Salvar' }))
    expect(await within(sheet()).findByText(/sem ponto de milhar/)).toBeInTheDocument()
    expect(within(sheet()).getByText(/Use uma data do projeto/)).toBeInTheDocument()
    expect(writesOf('block')).toHaveLength(0)
  })

  it('adds a block to a task and ticks a block optimistically', async () => {
    detail()
    fireEvent.click(await screen.findByRole('button', { name: /Ver 2 blocos/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Novo bloco' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Criar bloco' }))
    await waitFor(() => expect(writesOf('block')[0]).toMatchObject({
      op: 'insert', values: { id: 'new-uuid', task_id: 't1', code: '3.1', date: '2026-11-10', week: 'S03', description: 'Montar o modelo', person_id: 'david', hours: 1 },
    }))
    const open = release()
    const check = screen.getByRole('checkbox', { name: 'Feito: Revisar o modelo, 12/11' })
    tap(check)
    await waitFor(() => expect(check).toBeChecked())
    open()
    await waitFor(() => expect(writesOf('block')[1]).toMatchObject({ values: { done: true }, match: { id: 'b2' } }))
  })

  it('deletes a block with no confirmation; Desfazer inserts the same row back', async () => {
    detail()
    fireEvent.click(await screen.findByRole('button', { name: /Ver 2 blocos/ }))
    fireEvent.click(screen.getByRole('button', { name: /Editar bloco de 12\/11: Revisar o modelo/ }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Apagar bloco' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Revisar o modelo/ })).toBeNull())
    expect(writesOf('block')[0]).toMatchObject({ op: 'delete', match: { id: 'b2' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(writesOf('block')[1]).toMatchObject({ op: 'insert', values: { id: 'b2', description: 'Revisar o modelo', hours: 4, date: '2026-11-12' } }))
    expect(await screen.findByRole('button', { name: /Editar bloco de 12\/11: Revisar o modelo/ })).toBeInTheDocument()
  })

  it('deleting a task deletes its blocks; Desfazer brings both back', async () => {
    detail()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar tarefa: Montar o modelo' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Apagar tarefa e seus blocos' }))
    expect(await screen.findByText('Tarefa e 2 blocos apagados.')).toBeInTheDocument()
    expect(m.writes.map((w) => `${w.table} ${w.op}`)).toEqual(['block delete', 'task delete'])
    expect(m.db.block.map((b) => b.id)).toEqual(['b3'])
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(m.db.block.map((b) => b.id).sort()).toEqual(['b1', 'b2', 'b3']))
    expect(m.db.task.map((t) => t.id)).toEqual(['t1'])
  })
})

describe('Entrega: dependencies', () => {
  it('confirms a suggested link, removes one with undo, adds one, and refuses a cycle', async () => {
    detail()
    const on = await screen.findByRole('list', { name: '3.1 depende de' })
    expect(within(on).getByText('Sugerida')).toBeInTheDocument()
    fireEvent.click(within(on).getByRole('button', { name: /Confirmar: P-01/ }))
    await waitFor(() => expect(writesOf('dependency')[0]).toMatchObject({ op: 'update', values: { suggested: false }, match: { id: 'dep2' } }))
    expect(within(on).queryByText('Sugerida')).toBeNull()

    const holds = screen.getByRole('list', { name: '3.1 segura' })
    fireEvent.click(within(holds).getByRole('button', { name: /Remover: 3.2/ }))
    await waitFor(() => expect(writesOf('dependency')[1]).toMatchObject({ op: 'delete', match: { id: 'dep1' } }))
    expect(screen.getByText('Nenhuma entrega espera por esta.')).toBeInTheDocument()
    const toast = (await screen.findByText('Dependência removida.')).parentElement!
    fireEvent.click(within(toast).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(writesOf('dependency')[2]).toMatchObject({ op: 'insert', values: { id: 'dep1', from_ref: '3.1', to_code: '3.2' } }))

    // 3.1 holds 3.2, so "3.1 depends on 3.2" would be a loop
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.change(within(sheet()).getByLabelText('3.1 depende de'), { target: { value: '3.2' } })
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Adicionar' }))
    expect(await within(sheet()).findByText('Isso criaria um ciclo: 3.2 já depende de 3.1.')).toBeInTheDocument()
    expect(writesOf('dependency')).toHaveLength(3)

    fireEvent.change(within(sheet()).getByLabelText('3.1 depende de'), { target: { value: '3.10' } })
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(writesOf('dependency')[3]).toMatchObject({
      op: 'insert', values: { id: 'new-uuid', from_kind: 'deliverable', from_ref: '3.10', to_code: '3.1', suggested: false },
    }))
  })

  it('Anexo A rows of the deliverable are listed and editable', async () => {
    detail()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar campo Ação padrão' }))
    type(within(sheet()).getByLabelText(/^Quem preenche/), 'Terral preenche')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(writesOf('traceability')[0]).toMatchObject({ values: { filled_by: 'Terral preenche' }, match: { id: 'tr1' } }))
  })
})

describe('Calendário', () => {
  it('filters by person and by type (the legend chips)', async () => {
    mount('/don/calendario', <Calendario />)
    fireEvent.click(await screen.findByRole('button', { name: /quinta, 12\/11, 3 blocos/ }))
    const agenda = screen.getByRole('list', { name: 'Blocos de 12/11' })
    expect(within(agenda).getAllByRole('button')).toHaveLength(3)
    fireEvent.click(screen.getByRole('radio', { name: 'David' }))
    expect(within(screen.getByRole('list', { name: 'Blocos de 12/11' })).getAllByRole('button').map((b) => b.getAttribute('aria-label')))
      .toEqual(['Tarefa: Bloco b1, David, 6 h, feito', 'Tarefa: Revisar o modelo, David, 4 h'])
    fireEvent.click(screen.getByRole('radio', { name: 'Todos' }))
    fireEvent.click(screen.getByRole('button', { name: /Tarefa$/, pressed: true }))
    expect(within(screen.getByRole('list', { name: 'Blocos de 12/11' })).getAllByRole('button').map((b) => b.getAttribute('aria-label')))
      .toEqual(['Rito: Reunião de time, Lucas, 2 h'])
  })

  it('week view and arrow keys move between days; over-capacity days carry "!" and say so', async () => {
    mount('/don/calendario', <Calendario />)
    const day = await screen.findByRole('button', { name: /quinta, 12\/11, 3 blocos, 12 h, acima do limite \(David\)/ })
    expect(within(day).getByText('!')).toBeInTheDocument()
    const today = screen.getByRole('button', { name: /terça, 10\/11/ })
    expect(today).toHaveAttribute('aria-current', 'date')
    fireEvent.keyDown(today, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByRole('button', { name: /quarta, 11\/11/ })).toHaveFocus())
    fireEvent.click(screen.getByRole('radio', { name: 'Semana' }))
    expect(screen.getByRole('heading', { name: '09/11 a 15/11 · S03' })).toBeInTheDocument()
    expect(screen.getByText(/Acima do limite: David/)).toBeInTheDocument()
  })

  it('moving a block re-ranks the risks and the calendar at once (one cache, no reload)', async () => {
    mount('/don/calendario', <><Calendario /><Riscos /></>)
    expect(await screen.findByText('David: 10 h em 12/11 (limite 8 h)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /quinta, 12\/11/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Tarefa: Revisar o modelo, David, 4 h' }))
    type(within(sheet()).getByLabelText(/^Data/), '2026-11-13')
    const open = release()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Salvar' }))
    // before the server answers: the risk is gone and the block sits on its new day
    await waitFor(() => expect(screen.queryByText('David: 10 h em 12/11 (limite 8 h)')).toBeNull())
    expect(screen.getByRole('button', { name: /sexta, 13\/11, 1 bloco, 4 h/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quinta, 12\/11, 2 blocos, 8 h$/ })).toBeInTheDocument()
    expect(m.writes).toHaveLength(1)
    open()
    await waitFor(() => expect(m.db.block.find((b) => b.id === 'b2')).toMatchObject({ date: '2026-11-13', week: 'S03' }))
  })
})

describe('Histórico', () => {
  it('shows 50, newest first, grouped by day; "Carregar mais" fetches the older page by cursor', async () => {
    mount('/don/historico', <Historico />)
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(50)
    expect(items[0]).toHaveTextContent('Beto Teixeira mudou as horas de 59 h para 60 h')
    expect(screen.getByRole('region', { name: /6 de novembro/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(60))
    const pages = m.reads.filter((r) => r.table === 'history' && r.ops.some((o) => o.startsWith('range')))
    expect(pages.at(-1)!.ops).toEqual(['lt id 11', 'range 0 49'])
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
  })

  it('filters by table on the server', async () => {
    mount('/don/historico', <Historico />)
    await screen.findAllByRole('listitem')
    fireEvent.change(screen.getByLabelText('O que mudou'), { target: { value: 'block' } })
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(30))
    expect(m.reads.at(-1)!.ops).toEqual(['eq table_name block', 'range 0 49'])
  })

  it('the detail shows the deliverable history only', async () => {
    detail()
    const hist = await screen.findByRole('region', { name: 'Histórico' })
    await waitFor(() => expect(within(hist).getAllByRole('listitem')).toHaveLength(30))
    expect(m.reads.some((r) => r.table === 'history' && r.ops.join() === 'eq table_name deliverable,eq row_ref 3.1,range 0 49')).toBe(true)
  })
})

