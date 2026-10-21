// @vitest-environment jsdom
// Acessos: approve as Terral or Don (with person), blocking only after confirmation, the temporary password shown
// once, and no self-block or self-demotion.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../src/domain/types'

type Row = Record<string, unknown>

const mock = vi.hoisted(() => {
  const m = {
    db: {} as Record<string, Row[]>,
    updates: [] as { table: string; values: Row; match: Row }[],
    invokes: [] as { name: string; body: Row }[],
    invokeStatus: 200,
    profile: null as unknown as Profile,
  }
  const read = (t: string) => {
    const p = Promise.resolve().then(() => ({ data: structuredClone(m.db[t] ?? []), error: null })) as Promise<unknown> & Row
    p.order = () => p
    p.limit = () => p
    return p
  }
  const supabase = {
    from: (t: string) => ({
      select: () => read(t),
      update: (values: Row) => ({
        match: (match: Row) => ({
          select: async () => {
            m.updates.push({ table: t, values, match })
            for (const r of m.db[t] ?? []) if (Object.entries(match).every(([k, x]) => r[k] === x)) Object.assign(r, values)
            return { data: [], error: null }
          },
        }),
      }),
    }),
    functions: {
      invoke: async (name: string, opts: { body: Row }) => {
        m.invokes.push({ name, body: opts.body })
        if (m.invokeStatus === 200) return { data: { ok: true }, error: null }
        return { data: null, error: { name: 'FunctionsHttpError', message: 'x', context: new Response('{}', { status: m.invokeStatus }) } }
      },
    },
  }
  return { m, supabase }
})
vi.mock('../src/lib/supabase', () => ({ supabase: mock.supabase }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ profile: mock.m.profile }) }))

const { ToastProvider } = await import('../src/ui')
const { default: Acessos, tempPassword } = await import('../src/views/don/Acessos')
const { m } = mock

const prof = (id: string, display_name: string, o: Partial<Profile> = {}): Profile =>
  ({ id, display_name, role: null, status: 'pending', person_id: null, must_change_password: false, ...o })
const ME = prof('u-me', 'Roberto T', { role: 'don', status: 'approved', person_id: 'beto' })

beforeAll(() => {
  const p = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void }
  p.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  p.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
})
beforeEach(() => {
  m.profile = ME
  m.updates = []
  m.invokes = []
  m.invokeStatus = 200
  m.db = {
    person: [{ id: 'beto', name: 'Beto' }, { id: 'lucas', name: 'Lucas' }],
    profiles: ([
      ME,
      prof('u-ana', 'Ana'),
      prof('u-lu', 'Lucas Souza'),
      prof('u-carla', 'Carla', { role: 'terral', status: 'approved' }),
      prof('u-bia', 'Bia', { role: 'terral', status: 'blocked' }),
    ] as unknown as Row[]),
  }
})
afterEach(cleanup)

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><ToastProvider><MemoryRouter><Acessos /></MemoryRouter></ToastProvider></QueryClientProvider>,
  )
}
const row = async (name: string) => (await screen.findByText(name)).closest('li')!
const dialog = () => screen.getAllByRole('dialog').find((d) => d.hasAttribute('open'))!

describe('Acessos', () => {
  it('approves a pending sign-up as Terral in one tap', async () => {
    show()
    fireEvent.click(within(await row('Ana')).getByRole('button', { name: 'Liberar como Terral' }))
    await waitFor(() => expect(m.updates).toEqual([{ table: 'profiles', values: { role: 'terral', status: 'approved', person_id: null }, match: { id: 'u-ana' } }]))
  })

  it('approves as Don with the person picked', async () => {
    show()
    fireEvent.click(within(await row('Lucas Souza')).getByRole('button', { name: 'Liberar como Don' }))
    fireEvent.change(within(dialog()).getByLabelText('Pessoa da equipe'), { target: { value: 'lucas' } })
    expect(m.updates).toEqual([])
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Liberar' }))
    await waitFor(() => expect(m.updates).toEqual([{ table: 'profiles', values: { role: 'don', status: 'approved', person_id: 'lucas' }, match: { id: 'u-lu' } }]))
  })

  it('blocks only after the confirmation dialog', async () => {
    show()
    fireEvent.click(within(await row('Carla')).getByRole('button', { name: /^Gerenciar/ }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Bloquear acesso' }))
    expect(m.updates).toEqual([])
    expect(within(dialog()).getByText(/Carla perde o acesso/)).toBeInTheDocument()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancelar' }))
    expect(m.updates).toEqual([])

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Bloquear acesso' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Bloquear' }))
    await waitFor(() => expect(m.updates).toEqual([{ table: 'profiles', values: { status: 'blocked' }, match: { id: 'u-carla' } }]))
  })

  it('unblocks a blocked account back to approved', async () => {
    show()
    fireEvent.click(within(await row('Bia')).getByRole('button', { name: 'Desbloquear' }))
    await waitFor(() => expect(m.updates).toEqual([{ table: 'profiles', values: { status: 'approved' }, match: { id: 'u-bia' } }]))
  })

  it('shows the temporary password once, then forgets it', async () => {
    show()
    fireEvent.click(within(await row('Carla')).getByRole('button', { name: /^Gerenciar/ }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Gerar senha temporária' }))
    await waitFor(() => expect(m.invokes).toHaveLength(1))
    const { name, body } = m.invokes[0]
    expect(name).toBe('set-temp-password')
    expect(body.user_id).toBe('u-carla')
    const pass = body.password as string
    expect(pass).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{14}$/)
    expect(await screen.findByText(pass)).toBeInTheDocument()
    expect(screen.getByText(/não aparece de novo/)).toBeInTheDocument()

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByText(pass)).toBeNull())
  })

  it('says why a temporary password failed, in Portuguese', async () => {
    m.invokeStatus = 403
    show()
    fireEvent.click(within(await row('Carla')).getByRole('button', { name: /^Gerenciar/ }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Gerar senha temporária' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Só a equipe Don')
  })

  it('never offers to block, demote or reset the signed-in Don', async () => {
    show()
    const me = await row('Roberto T')
    expect(within(me).getByText('Você')).toBeInTheDocument()
    fireEvent.click(within(me).getByRole('button', { name: /^Gerenciar/ }))
    const d = dialog()
    expect(within(d).queryByRole('button', { name: 'Bloquear acesso' })).toBeNull()
    expect(within(d).queryByRole('button', { name: 'Gerar senha temporária' })).toBeNull()
    expect(within(d).queryAllByRole('radio')).toEqual([])
    expect(within(d).getByText(/não pode mudar o próprio papel/)).toBeInTheDocument()
  })

  it('confirms a role change before saving it', async () => {
    show()
    fireEvent.click(within(await row('Carla')).getByRole('button', { name: /^Gerenciar/ }))
    fireEvent.click(within(dialog()).getByRole('radio', { name: 'Don' }))
    fireEvent.change(within(dialog()).getByLabelText('Pessoa da equipe'), { target: { value: 'lucas' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Salvar' }))
    expect(m.updates).toEqual([])
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Mudar papel' }))
    await waitFor(() => expect(m.updates).toEqual([{ table: 'profiles', values: { role: 'don', person_id: 'lucas' }, match: { id: 'u-carla' } }]))
  })

  it('tempPassword: 14 unambiguous characters from crypto', () => {
    const seen = new Set(Array.from({ length: 50 }, () => tempPassword()))
    expect(seen.size).toBe(50)
    for (const p of seen) expect(p).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{14}$/)
  })
})
