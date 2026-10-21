// @vitest-environment jsdom
// Terral view and Don's "Visão da Terral": the ring, no Don names or hours on any screen, record_decision and
// confirm_date with their exact arguments, preview mode without writes, and the data contract (no usePlanData).
import '@testing-library/jest-dom/vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TERRAL_KEYS, toTerralData } from '../src/domain/terralView'
import { findForbidden } from '../src/domain/textGuard'
import { TABLE_OF, type PlanData, type Profile } from '../src/domain/types'
import { realPlan } from './helpers/realPlan'

type Row = Record<string, unknown>
type Rpc = { fn: string; args: Row }

const mock = vi.hoisted(() => {
  const m = { db: {} as Record<string, Row[]>, rpcs: [] as { fn: string; args: Record<string, unknown> }[], rpcError: null as unknown, profile: null as unknown }
  const read = (t: string) => {
    const p = Promise.resolve().then(() => ({ data: structuredClone(m.db[t] ?? []), error: null })) as Promise<unknown> & Record<string, unknown>
    p.order = () => p
    p.limit = () => p
    return p
  }
  const supabase = {
    from: (t: string) => ({ select: () => read(t) }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      m.rpcs.push({ fn, args })
      const fail = m.rpcError
      await new Promise((r) => setTimeout(r, 10))
      if (fail) return { data: null, error: fail }
      if (fn === 'record_decision') {
        const d = m.db.decision?.find((x) => x.code === args.p_code)
        if (d) Object.assign(d, { status: 'decided', outcome: args.p_outcome, decided_by: args.p_decided_by, decided_at: args.p_decided_at })
      }
      if (fn === 'confirm_date' && args.p_kind === 'deliverable') {
        const d = m.db.deliverable?.find((x) => x.code === args.p_ref)
        if (d) Object.assign(d, { in_use_start: args.p_date, in_use_end: args.p_date, in_use_confirmed: true })
      }
      if (fn === 'confirm_date' && args.p_kind === 'to_schedule') {
        const s = m.db.to_schedule?.find((x) => x.id === args.p_ref)
        if (s) s.confirmed_date = args.p_date
      }
      return { data: null, error: null }
    },
    storage: { from: () => ({}) },
  }
  return { m, supabase }
})
vi.mock('../src/lib/supabase', () => ({ supabase: mock.supabase }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ profile: mock.m.profile }) }))

const { ToastProvider } = await import('../src/ui')
const { Overview } = await import('../src/terral/Overview')
const { Milestones } = await import('../src/terral/Milestones')
const { Deliverables } = await import('../src/terral/Deliverables')
const { DeliverableDetail } = await import('../src/terral/DeliverableDetail')
const { Decisions } = await import('../src/terral/Decisions')
const { Goals } = await import('../src/terral/Goals')
const { greeting, projectSpan, weekNo, terralReasons, dueTone } = await import('../src/terral/model')
const { evaluate } = await import('../src/domain/risk')
const { extractCodes } = await import('../src/domain/textGuard')
const { default: VisaoTerral } = await import('../src/views/don/VisaoTerral')
const { m } = mock

const TERRAL: Profile = { id: 'u-t', display_name: 'Júlio Ponte', role: 'terral', status: 'approved', person_id: null, must_change_password: false }
const DON: Profile = { id: 'u-d', display_name: 'Beto Teixeira', role: 'don', status: 'approved', person_id: 'beto', must_change_password: false }
const TODAY = '2026-11-10'

/** The real plan, plus Don-only things that must never show: a hidden comment and file naming David with hours. */
function plan(): PlanData {
  const p = realPlan()
  p.deliverables.find((d) => d.code === '3.12')!.in_use_at = '2026-11-05'
  p.deliverables.find((d) => d.code === 'I2')!.in_use_at = '2026-11-06'
  const c = { entity_kind: 'deliverable', entity_ref: '3.1', created_at: '2026-11-01T12:00:00Z' }
  p.comments.push(
    { ...c, id: 'c1', author_role: 'don', author_name: 'Equipe Don', body: 'David fez 3 h nisso', visible_to_terral: false, comment_author: { author_id: 'u-d' } },
    { ...c, id: 'c2', author_role: 'don', author_name: 'Equipe Don', body: 'Base recebida, obrigado.', visible_to_terral: true, comment_author: { author_id: 'u-d' } },
    { ...c, id: 'c3', author_role: 'terral', author_name: 'Ana Terral', body: 'Mandamos a base ontem.', visible_to_terral: true, comment_author: { author_id: 'u-t' } },
  )
  p.evidence.push({ ...c, id: 'e1', storage_path: 'deliverable/3.1/x-Horas-Lucas.pdf', file_name: 'Horas Lucas 12 h.pdf', uploader_role: 'don', uploader_name: 'Equipe Don', visible_to_terral: false })
  return p
}

/** DB as each role reads it: Terral gets only its tables (what RLS returns); Don gets every table. */
function seed(role: 'terral' | 'don', p = plan()) {
  m.profile = role === 'terral' ? TERRAL : DON
  if (role === 'terral') {
    const t = toTerralData(p)
    m.db = Object.fromEntries(TERRAL_KEYS.map((k) => [TABLE_OF[k], structuredClone(t[k]) as unknown as Row[]]))
    // Terral's reads carry no author ids
    m.db.comment = m.db.comment.map(({ comment_author: _, ...r }) => r)
  } else {
    m.db = Object.fromEntries((Object.keys(TABLE_OF) as (keyof PlanData)[]).map((k) => [TABLE_OF[k], structuredClone(p[k]) as unknown as Row[]]))
    m.db.history = []
    m.db.profiles = [DON as unknown as Row]
  }
}

function mount(path: string) {
  window.history.replaceState({}, '', `/?today=${TODAY}`)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <Routes>
            <Route path="/t" element={<Overview />} />
            <Route path="/t/marcos" element={<Milestones />} />
            <Route path="/t/entregas" element={<Deliverables />} />
            <Route path="/t/entregas/:code" element={<DeliverableDetail />} />
            <Route path="/t/decisoes" element={<Decisions />} />
            <Route path="/t/metas" element={<Goals />} />
            <Route path="/don/terral/*" element={<VisaoTerral />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const loaded = () => waitFor(() => {
  expect(document.querySelector('.t-skel')).toBeNull()
  expect(document.querySelector('.t-page')).not.toBeNull()
})

/** Everything a person can read: text, plus titles and accessible names. */
function readable(): string {
  const attrs = [...document.querySelectorAll('[title],[aria-label]')].flatMap((e) => [e.getAttribute('title') ?? '', e.getAttribute('aria-label') ?? ''])
  return [document.body.textContent ?? '', ...attrs].join('\n')
}

beforeAll(() => {
  const p = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void }
  p.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  p.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
})
beforeEach(() => {
  m.rpcs = []
  m.rpcError = null
  seed('terral')
})
afterEach(cleanup)

describe('Visão geral', () => {
  it('rings "2/19" with 2 of 19 deliverables in use, and greets by first name', async () => {
    mount('/t')
    expect(await screen.findByRole('img', { name: '2 de 19 entregas' })).toHaveTextContent('2/19')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^(Bom dia|Boa tarde|Boa noite), Júlio\.$/)
    expect(screen.getByText('decisões tomadas').nextSibling).toHaveTextContent('0/15')
    expect(screen.getByText('pendências em aberto')).toBeInTheDocument()
    // heading order: h1, then the card's h2 (no h1 → h3 jump)
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    expect(screen.getByRole('heading', { level: 2, name: 'Alguns pontos pedem atenção.' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Próximos marcos' }).children).toHaveLength(5)
  })

  it('greets by the São Paulo hour and counts the project weeks from the data', () => {
    expect([greeting(5), greeting(11), greeting(12), greeting(17), greeting(18), greeting(2)]).toEqual(['Bom dia', 'Bom dia', 'Boa tarde', 'Boa tarde', 'Boa noite', 'Boa noite'])
    const span = projectSpan(toTerralData(realPlan()))
    expect(span).toEqual({ start: '2026-10-26', end: '2027-04-30', weeks: 27 })
    expect([weekNo('2026-10-21', span.start, 27), weekNo('2026-10-26', span.start, 27), weekNo(TODAY, span.start, 27), weekNo('2027-09-01', span.start, 27)]).toEqual([0, 1, 3, 27])
    expect(projectSpan({ ritual_occurrences: [] })).toEqual({ start: '2026-10-26', end: '2027-04-30', weeks: 27 })
  })

  it('"Confirmar data" on a to-schedule item calls confirm_date and shows "data confirmada"', async () => {
    mount('/t')
    await loaded()
    fireEvent.click(screen.getByRole('radio', { name: 'Datas a confirmar (8)' }))
    fireEvent.click(screen.getByRole('button', { name: /Mostrar todas/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar data: Conduzir as turmas' }))
    fireEvent.change(await screen.findByLabelText(/Data combinada/), { target: { value: '2027-01-20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(m.rpcs).toEqual([{ fn: 'confirm_date', args: { p_kind: 'to_schedule', p_ref: '3.13-1', p_date: '2027-01-20' } }]))
    const row = (await screen.findByText('Conduzir as turmas')).closest('li')!
    expect(within(row).getByText('data confirmada')).toBeInTheDocument()
    expect(within(row).queryByRole('button')).toBeNull()
  })
})

describe('no Don names or hours on any Terral screen', () => {
  const paths = (base: string) => ['', '/marcos', '/entregas', '/decisoes', '/metas', ...realPlan().deliverables.map((d) => `/entregas/${encodeURIComponent(d.code)}`)].map((p) => base + p)

  async function scan(path: string) {
    const v = mount(path)
    await loaded()
    // open everything a reader can open
    const expand = () => { for (const b of screen.queryAllByRole('button', { name: /Mostrar todas|Mostrar os que já passaram/ })) fireEvent.click(b) }
    expand()
    let text = readable()
    const dates = screen.queryByRole('radio', { name: /Datas a confirmar/ })
    if (dates) {
      fireEvent.click(dates)
      expand()
      text += readable()
    }
    v.unmount()
    return text
  }

  it.each([['terral', '/t'], ['don', '/don/terral']] as const)('as %s at %s', async (role, base) => {
    seed(role)
    for (const p of paths(base)) {
      const text = await scan(p)
      expect(text, p).not.toMatch(/David|Lucas|Beto/)
      expect(text, p).not.toMatch(/\d\s*h\b/)
      expect(findForbidden(text), p).toEqual([])
      expect(text, p).not.toContain('Horas Lucas')
    }
  }, 60_000)
})

describe('Decisões', () => {
  async function open(code: string) {
    mount('/t/decisoes')
    fireEvent.click(await screen.findByRole('button', { name: `Registrar decisão ${code}` }))
  }
  const fill = (outcome: string, by: string, at?: string) => {
    fireEvent.change(screen.getByLabelText(/O que foi decidido/), { target: { value: outcome } })
    fireEvent.change(screen.getByLabelText(/Quem decidiu/), { target: { value: by } })
    if (at !== undefined) fireEvent.change(screen.getByLabelText(/Data da decisão/), { target: { value: at } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))
  }

  it('submitting "Registrar decisão" calls record_decision with the entered values', async () => {
    await open('D01')
    fill('Plano validado, donos nomeados por posição', 'Diretoria executiva', '2026-11-09')
    await waitFor(() => expect(m.rpcs).toEqual<Rpc[]>([{ fn: 'record_decision', args: { p_code: 'D01', p_outcome: 'Plano validado, donos nomeados por posição', p_decided_by: 'Diretoria executiva', p_decided_at: '2026-11-09' } }]))
    const row = (await screen.findByText('Decidida em 09/11')).closest('li')!
    expect(within(row).getByText('Decidido por Diretoria executiva')).toBeInTheDocument()
    expect(within(row).queryByRole('button')).toBeNull() // Terral cannot re-decide
  })

  it('"Quem decidiu" refuses a Don name or hours, a future date, and empty fields, without calling the RPC', async () => {
    await open('D02')
    fill('Dez contas', 'David')
    expect(await screen.findByText(/sem nomes de pessoas nem horas/)).toBeInTheDocument()
    fill('Dez contas', 'Diretoria, 2 h')
    expect(await screen.findByText(/sem nomes de pessoas nem horas/)).toBeInTheDocument()
    fill('Dez contas', 'Diretoria executiva', '2026-12-01')
    expect(await screen.findByText('A data não pode ser depois de hoje.')).toBeInTheDocument()
    fill('', 'Diretoria executiva', TODAY)
    expect(await screen.findByText('Escreva o que foi decidido.')).toBeInTheDocument()
    expect(m.rpcs).toEqual([])
  })

  it('shows the RPC refusal in pt-BR and keeps the sheet open', async () => {
    m.rpcError = { code: '42501', message: 'decision D03 is already decided' }
    await open('D03')
    fill('Sim', 'Diretoria executiva', TODAY)
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta decisão já foi registrada.')
    expect(screen.getByLabelText(/O que foi decidido/)).toHaveValue('Sim')
  })
})

describe('Entrega', () => {
  async function confirmUse(code: string, date: string) {
    mount(`/t/entregas/${code}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar data de uso' }))
    fireEvent.change(await screen.findByLabelText(/Data combinada/), { target: { value: date } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
  }

  it('confirm date calls confirm_date and shows "data confirmada" without making it Em uso', async () => {
    await confirmUse('3.7', '2027-03-15')
    const detail = document.querySelector('.t-detail') as HTMLElement
    expect(await within(detail).findByText('data confirmada')).toBeInTheDocument() // at once (optimistic)
    expect(m.rpcs).toEqual([{ fn: 'confirm_date', args: { p_kind: 'deliverable', p_ref: '3.7', p_date: '2027-03-15' } }])
    await waitFor(() => expect(within(detail).getByText('Combinado para 15/03/2027')).toBeInTheDocument())
    expect(within(detail).queryByText(/Em uso/)).toBeNull()
    expect(within(detail).getByRole('button', { name: 'Mudar data de uso' })).toBeEnabled()
  })

  it('a failed confirm rolls back and says "Não salvou. Tente de novo."', async () => {
    m.rpcError = { code: 'XX000', message: 'boom' }
    await confirmUse('I5', '2027-03-20')
    expect(await screen.findByText('Não salvou. Tente de novo.')).toBeInTheDocument()
    expect(within(document.querySelector('.t-detail') as HTMLElement).queryByText('data confirmada')).toBeNull()
  })

  it('refuses an empty or impossible date', async () => {
    mount('/t/entregas/3.7')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar data de uso' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Escolha uma data.')).toBeInTheDocument()
    expect(m.rpcs).toEqual([])
  })

  it('shows Terral the comments it may read, with author names, and a composer', async () => {
    mount('/t/entregas/3.1')
    expect(await screen.findByText('Mandamos a base ontem.')).toBeInTheDocument()
    expect(screen.getByText('Base recebida, obrigado.')).toBeInTheDocument()
    expect(screen.getByText('Ana Terral')).toBeInTheDocument()
    expect(screen.getByLabelText('Novo comentário')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anexar arquivo' })).toBeInTheDocument()
  })
})

describe('Don preview', () => {
  beforeEach(() => seed('don'))

  it('shows the banner and the same screen, with Terral data only', async () => {
    mount('/don/terral')
    expect(await screen.findByText(/é assim que eles veem/)).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: '2 de 19 entregas' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^(Bom dia|Boa tarde|Boa noite)\.$/) // never the Don user's name
  })

  it('disables every write: decisions, dates, comments and files', async () => {
    mount('/don/terral/decisoes')
    const buttons = await screen.findAllByRole('button', { name: /Registrar decisão/ })
    expect(buttons).toHaveLength(15)
    for (const b of buttons) expect(b).toBeDisabled()
    cleanup()

    mount('/don/terral')
    await loaded()
    fireEvent.click(screen.getByRole('radio', { name: /Datas a confirmar/ }))
    const confirmButtons = screen.getAllByRole('button', { name: /^Confirmar data/ })
    expect(confirmButtons.length).toBeGreaterThan(0)
    for (const b of confirmButtons) expect(b).toBeDisabled()
    cleanup()

    mount('/don/terral/entregas/3.1')
    expect(await screen.findByRole('button', { name: 'Confirmar data de uso' })).toBeDisabled()
    expect(await screen.findByText('Base recebida, obrigado.')).toBeInTheDocument()
    expect(screen.queryByText('David fez 3 h nisso')).toBeNull()
    expect(screen.queryByLabelText('Novo comentário')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Anexar arquivo' })).toBeNull()
    expect(screen.queryByText(/Ocultar da Terral|Só Don/)).toBeNull()
    expect(m.rpcs).toEqual([])
  })
})

describe('data contract', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : []
  })
  // meeting mode too: a Don session there must show only what Terral sees
  const terralFiles = [...files('src/terral'), ...files('src/views/terral'), 'src/views/don/VisaoTerral.tsx', ...files('src/meeting'), 'src/views/Reuniao.tsx']

  it('Terral components read only useTerralData: no usePlanData, no Don-only tables or fields', () => {
    expect(terralFiles.length).toBeGreaterThanOrEqual(15)
    for (const f of terralFiles) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/usePlanData|DonData|loadPlan/)
      expect(src, f).not.toMatch(/\.(blocks|tasks|people|to_schedule_plan|open_items_internal|manual_risks|traceability|history|profiles)\b/)
      expect(src, f).not.toMatch(/\b(block|task|person|manual_risk|open_item_internal|to_schedule_plan|history)['"]\s*\)/) // supabase.from('block')
      const fromData = [...src.matchAll(/import\s*{([^}]*)}\s*from\s*'[./]*lib\/data'/g)].flatMap((x) => x[1].split(',').map((s) => s.trim()).filter(Boolean))
      for (const name of fromData) expect(['useTerralData', 'useMutate'], `${f}: ${name}`).toContain(name)
    }
  })
})

describe('executive reasons', () => {
  const clean = (lines: string[]) => {
    for (const l of lines) {
      expect(l).not.toMatch(/\b[PX]-\d/)
      expect(extractCodes(l), l).toEqual([])
      expect(findForbidden(l), l).toEqual([])
    }
  }

  it('on the real plan at 10/11: grouped, named, no codes, at most 3 lines', () => {
    const t = toTerralData(realPlan())
    const lines = terralReasons(evaluate(t, TODAY), t, TODAY)
    expect(lines).toEqual([
      '11 pendências passaram do prazo de 26/10. Uma delas segura a entrega «Lançamento interno».',
      'Falta combinar a data de «Alinhar a mensagem com a diretoria». A janela fecha em 24/11.',
      '6 entregas ainda não têm data de uso combinada.',
    ])
    clean(lines)
    for (const day of ['2026-10-21', '2026-12-20', '2027-03-15', '2027-06-01']) {
      const more = terralReasons(evaluate(t, day), t, day)
      expect(more.length).toBeLessThanOrEqual(3)
      clean(more)
    }
  })

  it('synthetic: singular and plural, late first, decision, window, waiting pendências', () => {
    const D = (code: string, name: string, o: Partial<PlanData['deliverables'][number]> = {}) => ({
      code, name, front: 'Vendas', origin: 'escopo2' as const, built_date: null, in_use_start: '2026-12-01', in_use_end: '2026-12-01', in_use_text: null,
      in_use_confirmed: false, built_at: null, in_use_at: null, target_ritual: null, terral_owner: null, published_flag: null, sort: 1, ...o,
    })
    const P = (code: string, due: string) => ({ code, kind: 'pendencia' as const, text: `Texto ${code}`, owner_public: 'Terral', due, due_text: null, effect: null, status: 'open' as const, visible_to_terral: true })
    const base = {
      deliverables: [D('3.1', 'Segmentação'), D('I2', 'Leitura de carteira'), D('3.8', 'Alertas', { in_use_start: '2026-11-05', in_use_end: '2026-11-05' })],
      decisions: [{ code: 'D05', title: 'Dono do dado comercial', date: '2026-11-06', prepared_on: null, status: 'pending' as const, outcome: null, decided_by: null, decided_at: null }],
      to_schedule: [{ id: '3.1-1', code: '3.1', what: 'Acordar a régua de tier', window_start: '2026-10-26', window_end: '2026-11-20', window_text: null, confirmed_date: null }],
      open_items: [P('P-26', '2026-11-01')],
      dependencies: [
        { id: 'a', from_kind: 'open_item' as const, from_ref: 'P-26', to_code: '3.1', suggested: false },
        { id: 'b', from_kind: 'decision' as const, from_ref: 'D05', to_code: 'I2', suggested: false },
      ],
    }
    const lines = terralReasons(evaluate(base, TODAY), base, TODAY, { max: 9 })
    expect(lines).toEqual([
      '«Alertas»: o uso estava previsto para 05/11.',
      // high (a late decision) before medium (the pendência holds «Segmentação», due in 21 days)
      'A decisão «Dono do dado comercial» estava prevista para 06/11 e ainda não foi registrada. Ela libera «Leitura de carteira».',
      'Uma pendência passou do prazo de 01/11. Ela segura a entrega «Segmentação».',
      'Falta combinar a data de «Acordar a régua de tier». A janela fecha em 20/11.',
      '«Segmentação»: a data de uso espera 1 pendência.',
    ])
    clean(lines)
    expect(terralReasons(evaluate(base, TODAY), base, TODAY)).toHaveLength(3)

    // two overdue, both holding: "2 delas seguram 2 entregas"; two late deliverables grouped
    const two = { ...base, open_items: [P('P-26', '2026-11-01'), P('P-27', '2026-11-01')], dependencies: [...base.dependencies, { id: 'c', from_kind: 'open_item' as const, from_ref: 'P-27', to_code: 'I2', suggested: false }],
      deliverables: base.deliverables.map((d) => d.code === '3.1' ? { ...d, in_use_start: '2026-11-02', in_use_end: '2026-11-02' } : d) }
    const out = terralReasons(evaluate(two, TODAY), two, TODAY, { max: 9 })
    expect(out[0]).toBe('2 entregas passaram da data prevista. A mais antiga é «Segmentação», prevista para 02/11.')
    expect(out).toContain('2 pendências passaram do prazo de 01/11. 2 delas seguram 2 entregas.')
    clean(out)
  })

  it('overdue pills: red only when the engine says high, amber otherwise, neutral when not yet due', () => {
    expect(dueTone('2026-10-26', TODAY, true)?.tone).toBe('bad')
    expect(dueTone('2026-10-26', TODAY)).toEqual({ tone: 'warn', label: 'venceu há 15 dias' })
    expect(dueTone(TODAY, TODAY)).toEqual({ tone: 'mute', label: 'vence hoje' })
    expect(dueTone('2026-11-13', TODAY)).toEqual({ tone: 'mute', label: 'vence em 3 dias' })
    expect(dueTone('2026-12-13', TODAY)).toBeNull()
  })

  it('Visão geral paints only the urgent pendência red and shows no bare codes beside the list', async () => {
    mount('/t')
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: /Mostrar todas/ }))
    const list = screen.getByRole('list', { name: 'Pendências da Terral' })
    const red = list.querySelectorAll('.ui-pill.bad')
    expect(red).toHaveLength(1) // P-01 holds «Lançamento interno», in use 23/11 (within 14 days)
    expect(red[0].closest('li')).toHaveTextContent('Lançamento do projeto no bloco presencial')
    expect(list.querySelectorAll('.ui-pill.warn').length).toBe(10)
    expect(list.textContent).not.toMatch(/\bP-\d/)
    const reasons = screen.getByRole('list', { name: 'Por quê' }).textContent ?? ''
    expect(reasons).not.toMatch(/\b[PX]-\d/)
    expect(reasons).toContain('«Lançamento interno»')
  })

  it('a past date in "Confirmar data de uso" warns but does not block', async () => {
    mount('/t/entregas/3.7')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar data de uso' }))
    fireEvent.change(await screen.findByLabelText(/Data combinada/), { target: { value: '2026-11-01' } })
    expect(screen.getByText(/Essa data já passou/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(m.rpcs).toEqual([{ fn: 'confirm_date', args: { p_kind: 'deliverable', p_ref: '3.7', p_date: '2026-11-01' } }]))
  })
})
