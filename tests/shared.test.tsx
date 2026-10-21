// @vitest-environment jsdom
// Shared Comments and Evidence, in both roles: explicit visibility, the Terral text guard, hide/show, upload paths,
// size limit, orphan cleanup, signed URLs.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../src/domain/types'

type Row = Record<string, unknown>
type Call = { op: string; table?: string; values?: unknown; match?: Row; path?: string; opts?: unknown }

const mock = vi.hoisted(() => {
  const m = {
    db: {} as Record<string, Row[]>,
    calls: [] as Call[],
    failInsert: false,
    failUpload: false,
    profile: null as unknown as Profile,
  }
  const read = (t: string) => {
    const p = Promise.resolve().then(() => ({ data: structuredClone(m.db[t] ?? []), error: null })) as Promise<unknown> & Row
    p.order = () => p
    p.limit = () => p
    return p
  }
  const later = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 5))
  const supabase = {
    from: (t: string) => ({
      select: () => read(t),
      insert: (v: Row) => ({
        select: () => {
          m.calls.push({ op: 'insert', table: t, values: v })
          if (m.failInsert) return later({ data: null, error: { message: 'boom' } })
          const row = { id: `srv-${m.calls.length}`, created_at: new Date().toISOString(), author_name: 'Equipe Don', uploader_name: 'Equipe Don', ...v }
          ;(m.db[t] ??= []).push(row)
          return later({ data: [row], error: null })
        },
      }),
      update: (v: Row) => ({
        match: (match: Row) => ({
          select: () => {
            m.calls.push({ op: 'update', table: t, values: v, match })
            for (const r of m.db[t] ?? []) if (Object.entries(match).every(([k, x]) => r[k] === x)) Object.assign(r, v)
            return later({ data: [], error: null })
          },
        }),
      }),
    }),
    storage: {
      from: () => ({
        upload: (path: string, _file: unknown, opts: unknown) => {
          m.calls.push({ op: 'upload', path, opts })
          return later(m.failUpload ? { data: null, error: { message: 'boom', statusCode: '500' } } : { data: { path }, error: null })
        },
        remove: (paths: string[]) => {
          m.calls.push({ op: 'remove', path: paths[0] })
          return later({ data: [], error: null })
        },
        createSignedUrl: (path: string, secs: number, o?: unknown) => {
          m.calls.push(o ? { op: 'sign', path, opts: [secs, o] } : { op: 'sign', path, opts: secs })
          return later({ data: { signedUrl: `https://signed.test/${path}?token=t` }, error: null })
        },
      }),
    },
  }
  return { m, supabase }
})
vi.mock('../src/lib/supabase', () => ({ supabase: mock.supabase }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ profile: mock.m.profile }) }))

const { ToastProvider } = await import('../src/ui')
const { Comments } = await import('../src/shared/Comments')
const { Evidence, evidencePath, safeFileName, MAX_BYTES } = await import('../src/shared/Evidence')
const { m } = mock

const DON = { id: 'u-don', display_name: 'Beto', role: 'don', status: 'approved', person_id: 'beto', must_change_password: false } as Profile
const TERRAL = { id: 'u-terral', display_name: 'Júlio', role: 'terral', status: 'approved', person_id: null, must_change_password: false } as Profile

const comment = (id: string, o: Row = {}) => ({
  id, entity_kind: 'deliverable', entity_ref: '3.1', author_role: 'don', author_name: 'Equipe Don', body: `Texto ${id}`,
  visible_to_terral: true, created_at: '2026-10-20T12:00:00Z', ...o,
})
const file = (id: string, o: Row = {}) => ({
  id, entity_kind: 'deliverable', entity_ref: '3.1', storage_path: `deliverable/3.1/${id}-a.pdf`, file_name: `${id}.pdf`,
  uploader_role: 'don', uploader_name: 'Equipe Don', visible_to_terral: true, created_at: '2026-10-20T12:00:00Z', ...o,
})

beforeAll(() => {
  const p = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void }
  p.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  p.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
})
beforeEach(() => {
  m.db = { comment: [], evidence: [], deliverable: [{ code: '3.1' }] }
  m.calls = []
  m.failInsert = false
  m.failUpload = false
  m.profile = DON
})
afterEach(cleanup)

function show(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>)
}
const writes = (op: string) => m.calls.filter((c) => c.op === op)

describe('Comments', () => {
  async function post(text: string) {
    fireEvent.change(await screen.findByLabelText('Novo comentário'), { target: { value: text } })
    fireEvent.click(screen.getByRole('button', { name: 'Comentar' }))
  }

  it('Don posts internal by default (spec §7), sending visible_to_terral: false explicitly, and shows it at once', async () => {
    show(<Comments entity_kind="deliverable" entity_ref="3.1" canHide />)
    expect(await screen.findByText('Nenhum comentário ainda.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Visível para a Terral' })).toHaveAttribute('aria-checked', 'false')
    await post('  Base recebida  ')
    expect(await screen.findByText('Base recebida')).toBeInTheDocument() // optimistic
    expect(writes('insert')).toEqual([{ op: 'insert', table: 'comment', values: { entity_kind: 'deliverable', entity_ref: '3.1', author_role: 'don', body: 'Base recebida', visible_to_terral: false } }])
  })

  it('Don turns the switch on to share one comment; the next comment starts internal again', async () => {
    show(<Comments entity_kind="deliverable" entity_ref="3.1" canHide={false} />)
    const sw = await screen.findByRole('switch', { name: 'Visível para a Terral' })
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await post('Base recebida, obrigado')
    await waitFor(() => expect(writes('insert')).toHaveLength(1))
    expect((writes('insert')[0].values as Row).visible_to_terral).toBe(true)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Visível para a Terral' })).toHaveAttribute('aria-checked', 'false'))
  })

  it('the guard blocks a Don name or hours only once shared, and lets them through when Don-only', async () => {
    show(<Comments entity_kind="deliverable" entity_ref="3.1" canHide />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Visível para a Terral' }))
    await post('Falar com David amanhã')
    expect(await screen.findByRole('alert')).toHaveTextContent('David')
    await post('Isso leva 3 h')
    expect(await screen.findByRole('alert')).toHaveTextContent('3 h')
    expect(writes('insert')).toEqual([])
    fireEvent.click(screen.getByRole('switch', { name: 'Visível para a Terral' }))
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Comentar' }))
    await waitFor(() => expect(writes('insert')).toHaveLength(1))
    expect(writes('insert')[0].values).toMatchObject({ body: 'Isso leva 3 h', visible_to_terral: false })
  })

  it('canHide toggles visibility optimistically; showing again runs the guard', async () => {
    m.db.comment = [comment('c1', { body: 'Tudo certo' }), comment('c2', { body: 'Ver com Lucas', visible_to_terral: false })]
    show(<Comments entity_kind="deliverable" entity_ref="3.1" canHide />)
    const first = (await screen.findByText('Tudo certo')).closest('li')!
    fireEvent.click(within(first).getByRole('button', { name: 'Ocultar da Terral' }))
    expect(await within(first).findByText('Só Don')).toBeInTheDocument()
    await waitFor(() => expect(writes('update')).toEqual([{ op: 'update', table: 'comment', values: { visible_to_terral: false }, match: { id: 'c1' } }]))

    const second = screen.getByText('Ver com Lucas').closest('li')!
    fireEvent.click(within(second).getByRole('button', { name: 'Mostrar para a Terral' }))
    expect(await screen.findByText(/"Lucas" é da equipe Don/)).toBeInTheDocument()
    expect(writes('update')).toHaveLength(1)
  })

  it('without canHide there is no toggle', async () => {
    m.db.comment = [comment('c1', { body: 'Tudo certo' })]
    show(<Comments entity_kind="deliverable" entity_ref="3.1" canHide={false} />)
    await screen.findByText('Tudo certo')
    expect(screen.queryByRole('button', { name: /Ocultar|Mostrar/ })).toBeNull()
  })

  it('Terral sees only visible comments, authors as stored, newest last, and posts visible without the guard', async () => {
    m.profile = TERRAL
    m.db.comment = [
      comment('c2', { body: 'Segundo', author_role: 'terral', author_name: 'Júlio', created_at: '2026-10-20T13:00:00Z' }),
      comment('c1', { body: 'Primeiro' }),
      comment('c3', { body: 'Interno', visible_to_terral: false }),
      comment('c4', { body: 'Outra entrega', entity_ref: '3.2' }),
    ]
    show(<Comments entity_kind="deliverable" entity_ref="3.1" canHide />)
    await screen.findByText('Primeiro')
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('.cm-body')?.textContent)).toEqual(['Primeiro', 'Segundo'])
    expect(within(items[0]).getByText('Equipe Don')).toBeInTheDocument()
    expect(within(items[1]).getByText('Júlio')).toBeInTheDocument()
    expect(screen.queryByText('Interno')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: /Ocultar|Mostrar/ })).toBeNull()

    await post('Falei com o David, 3 h')
    await waitFor(() => expect(writes('insert')).toHaveLength(1))
    expect(writes('insert')[0].values).toEqual({ entity_kind: 'deliverable', entity_ref: '3.1', author_role: 'terral', body: 'Falei com o David, 3 h', visible_to_terral: true })
    expect(await screen.findByText('Falei com o David, 3 h')).toBeInTheDocument()
  })

  it('a failed Don post rolls back, toasts and gives the draft back', async () => {
    m.failInsert = true
    show(<Comments entity_kind="deliverable" entity_ref="3.1" canHide />)
    await post('Vai falhar')
    expect(await screen.findByText('Não salvou. Tente de novo.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Novo comentário')).toHaveValue('Vai falhar'))
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})

describe('Evidence', () => {
  const pick = (f: File) => fireEvent.change(screen.getByLabelText('Escolher arquivo'), { target: { files: [f] } })
  const pdf = (name = 'Relatório final (v2).pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' })
  const UUID = '[0-9a-f-]{36}'

  it('safeFileName keeps ASCII letters, digits, dot, dash and underscore', () => {
    expect(safeFileName('Relatório final (v2).pdf')).toBe('Relatorio-final-v2.pdf')
    expect(safeFileName('../../etc/passwd')).toBe('etc-passwd')
    expect(safeFileName('文件.pdf')).toBe('arquivo.pdf')
    expect(evidencePath({ role: 'don', uid: 'u1', kind: 'deliverable', ref: '3.1', name: 'a b.pdf', id: 'X' })).toBe('deliverable/3.1/X-a-b.pdf')
    expect(evidencePath({ role: 'terral', uid: 'u1', kind: 'deliverable', ref: '3.1', name: 'a b.pdf', id: 'X' })).toBe('u1/deliverable/3.1/X-a-b.pdf')
  })

  it('Don uploads to <kind>/<ref>/<uuid>-<name>, then writes the row with visibility explicit', async () => {
    show(<Evidence entity_kind="deliverable" entity_ref="3.1" />)
    await screen.findByText('Nenhum arquivo ainda.')
    pick(pdf())
    await waitFor(() => expect(writes('insert')).toHaveLength(1))
    const up = writes('upload')[0]
    expect(up.path).toMatch(new RegExp(`^deliverable/3\\.1/${UUID}-Relatorio-final-v2\\.pdf$`))
    expect(up.opts).toMatchObject({ contentType: 'application/pdf', upsert: false })
    expect(writes('insert')[0].values).toEqual({
      entity_kind: 'deliverable', entity_ref: '3.1', storage_path: up.path, file_name: 'Relatório final (v2).pdf', uploader_role: 'don', visible_to_terral: true,
    })
    await waitFor(() => expect(screen.getByRole('button', { name: /Abrir Relatório final \(v2\)\.pdf/ })).toBeInTheDocument())
  })

  it('Terral uploads inside its own <uid>/ folder, always visible', async () => {
    m.profile = TERRAL
    show(<Evidence entity_kind="deliverable" entity_ref="3.1" />)
    await screen.findByText('Nenhum arquivo ainda.')
    pick(pdf('ata.pdf'))
    await waitFor(() => expect(writes('insert')).toHaveLength(1))
    expect(writes('upload')[0].path).toMatch(new RegExp(`^u-terral/deliverable/3\\.1/${UUID}-ata\\.pdf$`))
    expect(writes('insert')[0].values).toMatchObject({ uploader_role: 'terral', visible_to_terral: true })
    await waitFor(() => expect(screen.getByRole('button', { name: /Abrir ata\.pdf/ })).toBeInTheDocument())
  })

  it('refuses files over 25 MB and unknown types before uploading', async () => {
    show(<Evidence entity_kind="deliverable" entity_ref="3.1" />)
    await screen.findByText('Nenhum arquivo ainda.')
    const big = pdf('grande.pdf')
    Object.defineProperty(big, 'size', { value: MAX_BYTES + 1 })
    pick(big)
    expect(await screen.findByRole('alert')).toHaveTextContent('25 MB')
    pick(new File(['x'], 'nota.txt', { type: 'text/plain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('PDF')
    expect(m.calls).toEqual([])
  })

  it('removes the uploaded file when the row write fails; writes no row when the upload fails', async () => {
    m.failInsert = true
    show(<Evidence entity_kind="deliverable" entity_ref="3.1" />)
    await screen.findByText('Nenhum arquivo ainda.')
    pick(pdf('a.pdf'))
    await waitFor(() => expect(writes('remove')).toHaveLength(1))
    expect(writes('remove')[0].path).toBe(writes('upload')[0].path)

    m.calls = []
    m.failInsert = false
    m.failUpload = true
    pick(pdf('b.pdf'))
    expect(await screen.findByText('Não deu para enviar o arquivo. Tente de novo.')).toBeInTheDocument()
    expect(writes('insert')).toEqual([])
  })

  it('opens a file through a short-lived signed URL, never a public one', async () => {
    m.db.evidence = [file('e1')]
    const tab = { location: { href: '' }, opener: {} as unknown, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    show(<Evidence entity_kind="deliverable" entity_ref="3.1" />)
    fireEvent.click(await screen.findByRole('button', { name: /Abrir e1\.pdf/ }))
    await waitFor(() => expect(tab.location.href).toBe('https://signed.test/deliverable/3.1/e1-a.pdf?token=t'))
    expect(writes('sign')).toEqual([{ op: 'sign', path: 'deliverable/3.1/e1-a.pdf', opts: 60 }])
    expect(tab.opener).toBeNull()
    open.mockRestore()
  })

  it('Office files download through a signed link; a blocked popup falls back to a link, never the app URL', async () => {
    m.db.evidence = [file('e1', { file_name: 'Plano.xlsx', storage_path: 'deliverable/3.1/e1-Plano.xlsx' }), file('e2')]
    const open = vi.spyOn(window, 'open').mockReturnValue(null) // blocked
    const clicks: { href: string; target: string; rel: string }[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.href, target: this.target, rel: this.rel })
    })
    const before = window.location.href
    show(<Evidence entity_kind="deliverable" entity_ref="3.1" />)
    fireEvent.click(await screen.findByRole('button', { name: /Abrir Plano\.xlsx/ }))
    await waitFor(() => expect(clicks).toHaveLength(1))
    expect(writes('sign')[0]).toEqual({ op: 'sign', path: 'deliverable/3.1/e1-Plano.xlsx', opts: [60, { download: 'Plano.xlsx' }] })
    expect(open).not.toHaveBeenCalled() // a download opens no empty tab

    fireEvent.click(screen.getByRole('button', { name: /Abrir e2\.pdf/ }))
    await waitFor(() => expect(clicks).toHaveLength(2))
    expect(open).toHaveBeenCalledTimes(1)
    expect(writes('sign')[1]).toEqual({ op: 'sign', path: 'deliverable/3.1/e2-a.pdf', opts: 60 })
    expect(clicks[1]).toEqual({ href: 'https://signed.test/deliverable/3.1/e2-a.pdf?token=t', target: '_blank', rel: 'noopener' })
    expect(window.location.href).toBe(before)
    open.mockRestore()
    click.mockRestore()
  })

  it('Don toggles visibility; a file name with a Don name is not shown to Terral', async () => {
    m.db.evidence = [file('e1'), file('e2', { file_name: 'Plano_David.pdf', visible_to_terral: false })]
    show(<Evidence entity_kind="deliverable" entity_ref="3.1" />)
    const first = (await screen.findByRole('button', { name: /Abrir e1\.pdf/ })).closest('li')!
    fireEvent.click(within(first).getByRole('button', { name: 'Ocultar da Terral' }))
    await waitFor(() => expect(writes('update')).toEqual([{ op: 'update', table: 'evidence', values: { visible_to_terral: false }, match: { id: 'e1' } }]))
    const second = screen.getByRole('button', { name: /Abrir Plano_David\.pdf/ }).closest('li')!
    fireEvent.click(within(second).getByRole('button', { name: 'Mostrar para a Terral' }))
    expect(await screen.findByText(/"David" é da equipe Don/)).toBeInTheDocument()
    expect(writes('update')).toHaveLength(1)
  })
})
