// @vitest-environment jsdom
// Meeting mode (/reuniao): four steps driven by keys, dots and swipe; Esc goes home; only Terral-safe data, even in a
// Don session; keys are left alone while a form field or the record sheet has focus.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TERRAL_KEYS, toTerralData } from '../src/domain/terralView'
import { findForbidden } from '../src/domain/textGuard'
import { TABLE_OF, type PlanData, type Profile } from '../src/domain/types'
import { realPlan } from './helpers/realPlan'

type Row = Record<string, unknown>

const mock = vi.hoisted(() => {
  const m = { db: {} as Record<string, Row[]>, profile: null as unknown, rpcs: [] as unknown[] }
  const read = (t: string) => {
    const p = Promise.resolve().then(() => ({ data: structuredClone(m.db[t] ?? []), error: null })) as Promise<unknown> & Record<string, unknown>
    p.order = () => p
    p.limit = () => p
    return p
  }
  const supabase = {
    from: (t: string) => ({ select: () => read(t) }),
    rpc: async (fn: string, args: unknown) => { m.rpcs.push({ fn, args }); return { data: null, error: null } },
    storage: { from: () => ({}) },
  }
  return { m, supabase }
})
vi.mock('../src/lib/supabase', () => ({ supabase: mock.supabase }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ profile: mock.m.profile }) }))

const { ToastProvider } = await import('../src/ui')
const { Meeting } = await import('../src/meeting/Meeting')
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

function seed(role: 'terral' | 'don') {
  const p = plan()
  m.profile = role === 'terral' ? TERRAL : DON
  m.db = role === 'terral'
    ? Object.fromEntries(TERRAL_KEYS.map((k) => [TABLE_OF[k], structuredClone(toTerralData(p)[k]) as unknown as Row[]]))
    : { ...Object.fromEntries((Object.keys(TABLE_OF) as (keyof PlanData)[]).map((k) => [TABLE_OF[k], structuredClone(p[k]) as unknown as Row[]])), history: [], profiles: [DON as unknown as Row] }
}

function mount() {
  window.history.replaceState({}, '', `/?today=${TODAY}`)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/reuniao']}>
        <ToastProvider>
          <Routes>
            <Route path="/reuniao" element={<Meeting />} />
            <Route path="/t" element={<p>HOME-T</p>} />
            <Route path="/don/hoje" element={<p>HOME-DON</p>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** The step the dots mark as current. */
const step = () => document.querySelector('[aria-current="step"]')?.getAttribute('aria-label')
const key = (k: string, target: Element | Window = window) => fireEvent.keyDown(target, { key: k })
const ready = () => screen.findByRole('img', { name: /de 19 entregas/ })

beforeAll(() => {
  const p = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void }
  p.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  p.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
})
beforeEach(() => { m.rpcs = []; seed('terral') })
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
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar decisão D07' }))
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

  it('Don runs the meeting but cannot record as Terral', async () => {
    seed('don')
    mount()
    await ready()
    key('ArrowRight')
    key('ArrowRight')
    const b = await screen.findByRole('button', { name: 'Registrar decisão D07' })
    expect(b).toBeDisabled()
    expect(b).toHaveAttribute('title', expect.stringMatching(/Só a Terral/))
  })

  it('Decisões da semana: dated within 7 days of today; Pendências: open items and dates to confirm', async () => {
    mount()
    await ready()
    key('ArrowRight')
    key('ArrowRight')
    await screen.findByRole('heading', { level: 1, name: 'Decisões da semana' })
    await waitFor(() => expect(document.querySelectorAll('.m-step')).toHaveLength(1)) // the outgoing slide has left
    // D02–D06 (06/11) and D07 (13/11) are in the window; D01 (27/10) and D08 (27/11) are not
    expect(screen.queryByText(/D01|D08/)).toBeNull()
    expect(screen.getByText('D07')).toBeInTheDocument()
    key('ArrowRight')
    await screen.findByRole('heading', { level: 1, name: 'Pendências' })
    expect(screen.getAllByRole('button', { name: /^Confirmar data:/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^\+\d+$/).length).toBeGreaterThan(0) // the long list is cut with a "+N"
  })
})
