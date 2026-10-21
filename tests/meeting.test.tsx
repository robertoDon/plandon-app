// @vitest-environment jsdom
// Meeting mode (/reuniao): four steps driven by keys, dots and swipe; Esc goes home; only Terral-safe data, even in a
// Don session; keys are left alone while a form field or the record sheet has focus.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TERRAL_KEYS, toTerralData } from '../src/domain/terralView'
import { findForbidden } from '../src/domain/textGuard'
import { TABLE_OF, type PlanData, type Profile } from '../src/domain/types'
import { realPlan } from './helpers/realPlan'

type Row = Record<string, unknown>

const mock = vi.hoisted(() => {
  const m = { db: {} as Record<string, Row[]>, profile: null as unknown, rpcs: [] as unknown[], delay: 20 }
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
      await new Promise((r) => setTimeout(r, m.delay))
      if (fn === 'record_decision') Object.assign(m.db.decision?.find((x) => x.code === args.p_code) ?? {}, { status: 'decided', outcome: args.p_outcome, decided_by: args.p_decided_by, decided_at: args.p_decided_at })
      if (fn === 'confirm_date' && args.p_kind === 'to_schedule') Object.assign(m.db.to_schedule?.find((x) => x.id === args.p_ref) ?? {}, { confirmed_date: args.p_date })
      return { data: null, error: null }
    },
    storage: { from: () => ({}) },
  }
  return { m, supabase }
})
vi.mock('../src/lib/supabase', () => ({ supabase: mock.supabase }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ profile: mock.m.profile }) }))

const { ToastProvider } = await import('../src/ui')
const { Meeting, stepOf, meetingMilestones, weekDecisions } = await import('../src/meeting/Meeting')
const { m } = mock

const TERRAL: Profile = { id: 'u-t', display_name: 'Júlio Ponte', role: 'terral', status: 'approved', person_id: null, must_change_password: false }
const DON: Profile = { id: 'u-d', display_name: 'Beto Teixeira', role: 'don', status: 'approved', person_id: 'beto', must_change_password: false }
const TODAY = '2026-11-10'

/** The real plan plus Don-only bait: an X-item and a hidden pendência naming Don people with hours. */
function plan(): PlanData {
  const p = realPlan()
  const base = p.open_items.find((o) => o.code === 'X-01')!
  p.open_items.push(
    { ...base, code: 'X-09', kind: 'divergencia', visible_to_terral: false, status: 'open', due: TODAY, text: 'Divergência: David lança 12 h a mais' },
    { ...base, code: 'P-90', kind: 'pendencia', visible_to_terral: false, status: 'open', due: TODAY, text: 'Lucas cobra 4 h da Terral' },
  )
  return p
}

function seed(role: 'terral' | 'don', p = plan()) {
  m.profile = role === 'terral' ? TERRAL : DON
  m.db = role === 'terral'
    ? Object.fromEntries(TERRAL_KEYS.map((k) => [TABLE_OF[k], structuredClone(toTerralData(p)[k]) as unknown as Row[]]))
    : { ...Object.fromEntries((Object.keys(TABLE_OF) as (keyof PlanData)[]).map((k) => [TABLE_OF[k], structuredClone(p[k]) as unknown as Row[]])), history: [], profiles: [DON as unknown as Row] }
}

/** Where the router is: the meeting writes ?passo= there. */
function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}

function mount(path = '/reuniao') {
  window.history.replaceState({}, '', `/?today=${TODAY}`)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <Routes>
            <Route path="/reuniao" element={<Meeting />} />
            <Route path="/t" element={<p>HOME-T</p>} />
            <Route path="/don/hoje" element={<p>HOME-DON</p>} />
          </Routes>
          <Where />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** The step the dots mark as current. */
const step = () => document.querySelector('[aria-current="step"]')?.getAttribute('aria-label')
const key = (k: string, target: Element | Window = window) => fireEvent.keyDown(target, { key: k })
/** Data loaded: a step is on screen. */
const ready = () => waitFor(() => expect(document.querySelector('.m-step')).not.toBeNull())

beforeAll(() => {
  const p = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void }
  p.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  p.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
})
beforeEach(() => { m.rpcs = []; m.delay = 20; seed('terral') })
afterEach(cleanup)

describe('navigation', () => {
  it('ArrowRight goes Saúde → Marcos, PageUp goes back', async () => {
    mount()
    await ready()
    expect(step()).toBe('Passo 1 de 4: Saúde')
    key('ArrowRight')
    expect(step()).toBe('Passo 2 de 4: Marcos')
    expect(await screen.findByRole('heading', { level: 1, name: 'Marcos' })).toBeInTheDocument()
    key('PageUp')
    expect(step()).toBe('Passo 1 de 4: Saúde')
    key('ArrowLeft')
    expect(step()).toBe('Passo 1 de 4: Saúde')
  })

  it('stops at step 4; PageDown and Space go forward, and Space does not scroll', async () => {
    mount()
    await ready()
    key('PageDown')
    expect(step()).toBe('Passo 2 de 4: Marcos')
    expect(key(' ')).toBe(false) // default prevented: no page scroll
    expect(step()).toBe('Passo 3 de 4: Decisões da semana')
    key('ArrowRight')
    expect(step()).toBe('Passo 4 de 4: Pendências')
    key('ArrowRight')
    expect(step()).toBe('Passo 4 de 4: Pendências')
    expect(screen.getAllByRole('status').map((e) => e.textContent)).toContain('Passo 4 de 4: Pendências')
  })

  it('the step dots are clickable', async () => {
    mount()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Passo 3 de 4: Decisões da semana' }))
    expect(step()).toBe('Passo 3 de 4: Decisões da semana')
    expect(await screen.findByRole('heading', { level: 1, name: 'Decisões da semana' })).toBeInTheDocument()
  })

  it.each([['terral', 'HOME-T'], ['don', 'HOME-DON']] as const)('Esc goes to the %s home', async (role, home) => {
    seed(role)
    mount()
    await ready()
    key('Escape')
    expect(await screen.findByText(home)).toBeInTheDocument()
  })

  it('leaves keys alone while a form field or the record sheet has focus', async () => {
    mount()
    await ready()
    key('ArrowRight')
    key('ArrowRight')
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar decisão D02' }))
    const field = await screen.findByLabelText(/O que foi decidido/)
    field.focus()
    for (const k of ['ArrowRight', ' ', 'PageDown', 'ArrowLeft', 'Escape']) expect(key(k, field)).toBe(true)
    expect(step()).toBe('Passo 3 de 4: Decisões da semana')
    expect(screen.queryByText('HOME-T')).toBeNull()
  })
})

describe('data', () => {
  /** Everything a person can read on the four steps: text, titles and accessible names. */
  async function readAll() {
    mount()
    await ready()
    let text = ''
    for (let i = 0; i < 4; i++) {
      await waitFor(() => expect(document.querySelectorAll('.m-step')).toHaveLength(1))
      const attrs = [...document.querySelectorAll('[title],[aria-label]')].flatMap((e) => [e.getAttribute('title') ?? '', e.getAttribute('aria-label') ?? ''])
      text += [document.body.textContent ?? '', ...attrs].join('\n')
      key('ArrowRight')
    }
    return text
  }

  it.each(['terral', 'don'] as const)('as %s: no X-items, Don names, hours or P-/X- codes on any step', async (role) => {
    seed(role)
    const text = await readAll()
    expect(text).toContain('Decisões da semana')
    expect(text).not.toMatch(/David|Lucas|Beto|Divergência/)
    expect(text).not.toMatch(/\d\s*h\b/)
    expect(text).not.toMatch(/\b[PX]-\d/)
    expect(findForbidden(text)).toEqual([])
  }, 30_000)

  /** Opens "Registrar decisão" for `code` on step 3 and submits the form. */
  async function record(code: string, outcome: string, by = 'Diretoria executiva') {
    fireEvent.click(await screen.findByRole('button', { name: `Registrar decisão ${code}` }))
    fireEvent.change(await screen.findByLabelText(/O que foi decidido/), { target: { value: outcome } })
    fireEvent.change(screen.getByLabelText(/Quem decidiu/), { target: { value: by } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))
  }

  it('Don runs the War Room and records a decision; it shows at once', async () => {
    seed('don')
    mount('/reuniao?passo=3')
    await ready()
    const b = await screen.findByRole('button', { name: 'Registrar decisão D02' })
    expect(b).toBeEnabled()
    expect(b).not.toHaveAttribute('title')
    expect(screen.queryByText(/fica com a Terral|Só a Terral/)).toBeNull()
    await record('D02', 'Dez contas no piloto')
    await waitFor(() => expect(m.rpcs).toEqual([{ fn: 'record_decision', args: { p_code: 'D02', p_outcome: 'Dez contas no piloto', p_decided_by: 'Diretoria executiva', p_decided_at: TODAY } }]))
    expect(await screen.findByText(/Dez contas no piloto/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar decisão D02' })).toBeNull()
  })

  it('a Don user\'s outcome passes the Terral text guard; Terral\'s does not need to', async () => {
    seed('don')
    mount('/reuniao?passo=3')
    await ready()
    await record('D02', 'David leva 3 h nisso')
    expect(await screen.findByText(/"David" é da equipe Don/)).toBeInTheDocument()
    expect(m.rpcs).toEqual([])
    cleanup()

    seed('terral')
    mount('/reuniao?passo=3')
    await ready()
    await record('D02', 'Falamos com o David')
    await waitFor(() => expect(m.rpcs).toHaveLength(1))
    expect(m.rpcs[0]).toMatchObject({ fn: 'record_decision', args: { p_outcome: 'Falamos com o David' } })
  })
  it('Decisões da semana: dated within 7 days of today; Pendências: open items and dates to confirm', async () => {
    mount()
    await ready()
    key('ArrowRight')
    key('ArrowRight')
    await screen.findByRole('heading', { level: 1, name: 'Decisões da semana' })
    await waitFor(() => expect(document.querySelectorAll('.m-step')).toHaveLength(1)) // the outgoing slide has left
    // "Em atraso": D01 (27/10, open, before the week); then D02–D06 (06/11) and D07 (13/11); D08 (27/11) is out
    expect(screen.getByRole('list', { name: 'Decisões em atraso' })).toHaveTextContent('D01')
    expect(screen.queryByText(/D08/)).toBeNull()
    expect(screen.queryByText('D07')).toBeNull() // 7 decisions, 6 shown
    fireEvent.click(screen.getByRole('button', { name: '+1 decisões' }))
    expect(screen.getByText('D07')).toBeInTheDocument()
    key('ArrowRight')
    await screen.findByRole('heading', { level: 1, name: 'Pendências' })
    expect(screen.getAllByRole('button', { name: /^Confirmar data:/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^\+\d+$/).length).toBeGreaterThan(0) // the long list is cut with a "+N"
  })
})

describe('fix round 1', () => {
  it('Marcos: day 30 in, day 31 out, past and done out', () => {
    const p = plan()
    const set = (code: string, name: string, date: string, done = false) => {
      const d = p.deliverables.find((x) => x.code === code)!
      Object.assign(d, { name, in_use_start: date, in_use_end: date, in_use_at: done ? date : null })
    }
    set('3.8', 'Dia 30', '2026-12-10')
    set('3.9', 'Dia 31', '2026-12-11')
    set('3.10', 'Ontem', '2026-11-09')
    set('3.11', 'Feita', '2026-11-15', true)
    const titles = meetingMilestones(toTerralData(p), TODAY).map((m) => m.title)
    expect(titles).toContain('Dia 30 em uso')
    expect(titles.join('|')).not.toMatch(/Dia 31|Ontem|Feita/)
    expect(titles.every((t) => !/Reunião|Comitê|War Room/.test(t))).toBe(true) // no rites
  })

  it('Decisões: open ones dated before the week or with no date come first, as "Em atraso"', () => {
    const p = plan()
    p.decisions.find((x) => x.code === 'D15')!.date = null
    Object.assign(p.decisions.find((x) => x.code === 'D02')!, { status: 'decided', outcome: 'ok', decided_by: 'Diretoria', decided_at: '2026-11-06' })
    p.decisions.find((x) => x.code === 'D01')!.status = 'pending'
    const { late, week } = weekDecisions(toTerralData(p), TODAY)
    expect(late.map((x) => x.code)).toEqual(['D01', 'D15'])
    expect(week.map((x) => x.code)).toEqual(['D03', 'D04', 'D05', 'D06', 'D07', 'D02']) // open first, decided last
  })

  it('"+N" is a real button: Space on it presses it (no step change), it opens the list in place', async () => {
    mount('/reuniao?passo=4')
    await ready()
    const more = await screen.findByRole('button', { name: /^\+17 pendências$/ })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    more.focus()
    expect(key(' ', more)).toBe(true) // left to the button
    expect(step()).toBe('Passo 4 de 4: Pendências')
    fireEvent.click(more) // what Enter/Space do on a native button
    expect(screen.getByRole('list', { name: 'Pendências em aberto' }).children).toHaveLength(22)
    expect(screen.getByRole('button', { name: 'Mostrar menos' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('?passo= picks the step, keeps the other params, and bad values mean step 1', async () => {
    expect([stepOf('1'), stepOf('4'), stepOf('0'), stepOf('5'), stepOf('2.5'), stepOf('x'), stepOf(null)]).toEqual([0, 3, 0, 0, 0, 0, 0])
    mount('/reuniao?today=2026-11-10&passo=3')
    await ready()
    expect(step()).toBe('Passo 3 de 4: Decisões da semana')
    key('ArrowRight')
    expect(screen.getByTestId('where')).toHaveTextContent('/reuniao?today=2026-11-10&passo=4')
  })

  it('Don confirms a date on step 4 in the meeting; it shows at once', async () => {
    seed('don')
    mount('/reuniao?passo=4')
    await ready()
    expect(screen.queryByText(/fica com a Terral|Só a Terral/)).toBeNull()
    const list = await screen.findByRole('list', { name: 'Datas a confirmar' })
    const first = within(list).getAllByRole('button', { name: /^Confirmar data:/ })[0]
    expect(first).toBeEnabled()
    const count = () => Number(screen.getByText(/^Datas a confirmar \(\d+\)$/).textContent!.match(/\d+/)![0])
    const before = count()
    fireEvent.click(first)
    fireEvent.change(await screen.findByLabelText(/Data combinada/), { target: { value: '2026-11-20' } })
    m.delay = 400
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(count()).toBe(before - 1)) // optimistic: before the server answers
    expect(screen.queryByText('Data confirmada: 20/11/2026.')).toBeNull()
    expect(m.rpcs).toEqual([{ fn: 'confirm_date', args: expect.objectContaining({ p_kind: 'to_schedule', p_date: '2026-11-20' }) }])
    expect(await screen.findByText('Data confirmada: 20/11/2026.')).toBeInTheDocument()
  })

  it('the record sheet is not inside the draggable step, so dragging in it cannot change the step', async () => {
    mount('/reuniao?passo=3')
    await ready()
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar decisão D02' }))
    const field = await screen.findByLabelText(/O que foi decidido/)
    expect(field.closest('.m-step')).toBeNull()
    expect(document.querySelector('.m-step dialog')).toBeNull()
    fireEvent.pointerDown(field, { pointerType: 'mouse', clientX: 400 })
    fireEvent.pointerMove(field, { pointerType: 'mouse', clientX: 100 })
    fireEvent.pointerUp(field, { pointerType: 'mouse', clientX: 100 })
    expect(step()).toBe('Passo 3 de 4: Decisões da semana')
    expect(screen.getByLabelText(/O que foi decidido/)).toBe(field)
  })

  it('guards: a key from inside a (closed) dialog, and any key while a dialog is open, are left alone', async () => {
    mount('/reuniao?passo=3')
    await ready()
    const closed = document.querySelector('dialog:not([open])')!
    const inner = closed.querySelector('h2') ?? closed
    expect(key('ArrowRight', inner)).toBe(true)
    expect(step()).toBe('Passo 3 de 4: Decisões da semana')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar decisão D02' }))
    await waitFor(() => expect(document.querySelector('dialog[open]')).not.toBeNull())
    expect(key('ArrowRight', document.body)).toBe(true)
    expect(step()).toBe('Passo 3 de 4: Decisões da semana')
  })
})
