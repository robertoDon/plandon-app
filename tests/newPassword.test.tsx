// @vitest-environment jsdom
// NewPassword: a session ended by a temporary password (403 session_not_found) signs out and lands on /login
// with a notice; other errors keep the generic message.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => {
  const m = { updateError: null as null | { status?: number; code?: string }, signOuts: [] as unknown[] }
  const supabase = {
    auth: {
      updateUser: async () => ({ data: null, error: m.updateError }),
      signOut: async (opts?: unknown) => { m.signOuts.push(opts); return { error: null } },
      signInWithPassword: async () => ({ error: null }),
    },
    rpc: async () => ({ error: null }),
  }
  return { m, supabase }
})
vi.mock('../src/lib/supabase', () => ({ supabase: mock.supabase }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ refresh: async () => {} }), signOut: async () => {} }))

const { default: NewPassword, SESSION_ENDED } = await import('../src/auth/NewPassword')
const { default: Login } = await import('../src/auth/Login')
const { m } = mock

beforeEach(() => {
  m.updateError = null
  m.signOuts = []
})
afterEach(cleanup)

function show() {
  render(
    <MemoryRouter initialEntries={['/nova-senha']}>
      <Routes>
        <Route path="/nova-senha" element={<NewPassword />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </MemoryRouter>,
  )
  for (const label of ['Nova senha', 'Repita a senha']) fireEvent.change(screen.getByLabelText(label), { target: { value: 'nova-senha-123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
}

describe('NewPassword', () => {
  it('a revoked session signs out locally and shows the notice on /login, once', async () => {
    m.updateError = { status: 403, code: 'session_not_found' }
    show()
    expect(await screen.findByText(SESSION_ENDED)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(m.signOuts).toEqual([{ scope: 'local' }])

    cleanup()
    render(<MemoryRouter><Login /></MemoryRouter>)
    expect(screen.queryByText(SESSION_ENDED)).toBeNull()
  })

  it('other errors keep the generic message and the session', async () => {
    m.updateError = { status: 500, code: 'unexpected_failure' }
    show()
    expect(await screen.findByText('Não deu para trocar a senha. Tente de novo.')).toBeInTheDocument()
    await waitFor(() => expect(m.signOuts).toEqual([]))
  })
})
