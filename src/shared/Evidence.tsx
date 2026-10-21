import { useId, useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useMutate } from '../lib/data'
import type { Evidence as EvidenceRow } from '../domain/types'
import type { TerralData } from '../domain/terralView'
import { Pill, useToast } from '../ui'
import { terralTextError } from '../don/forms'
import { addRow, patchRows } from '../don/mutations'
import { exactTime, relTime, shareable, TERRAL_QUERY, useEntityRows } from './entity'
import './shared.css'

/** Same limit and types as the 'evidence' bucket (0002_security.sql). */
export const MAX_BYTES = 25 * 1024 * 1024
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
const ALLOWED = new Set(Object.values(TYPES))
const INLINE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp'])
const SIGNED_URL_SECONDS = 60
const BUCKET = 'evidence'

const extOf = (name: string) => /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1].toLowerCase() ?? ''

/** ASCII letters, digits, "_" and "-" (accents folded, anything else becomes "-"), plus a lower-case extension. */
export function safeFileName(name: string): string {
  const ext = extOf(name)
  const base = (ext ? name.slice(0, -(ext.length + 1)) : name)
    .normalize('NFKD').replace(/[^\x00-\x7f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'arquivo'
  return ext ? `${base}.${ext}` : base
}

/** A path segment for an entity kind or ref ("3.1", "P-02", a uuid): never "..", never a slash. */
const seg = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^\.+/, '') || 'x'

/**
 * Storage key of a new file. Don: `<kind>/<ref>/<uuid>-<name>`. Terral: `<uid>/<kind>/<ref>/<uuid>-<name>`
 * (the storage policy lets Terral write only inside its own folder).
 */
export function evidencePath(p: { role: 'don' | 'terral'; uid: string; kind: string; ref: string; name: string; id?: string }): string {
  const path = `${seg(p.kind)}/${seg(p.ref)}/${p.id ?? crypto.randomUUID()}-${safeFileName(p.name)}`
  return p.role === 'terral' ? `${p.uid}/${path}` : path
}

function fileProblem(f: File): string | null {
  if (f.size > MAX_BYTES) return `"${f.name}" passa de 25 MB. Envie um arquivo menor.`
  if (!ALLOWED.has(f.type || TYPES[extOf(f.name)] || '')) return `"${f.name}" não é aceito. Envie PDF, imagem (PNG, JPG, WebP), Word, Excel ou PowerPoint.`
  return null
}

function uploadError(e: { message?: string; statusCode?: string } | null): string {
  const s = String(e?.statusCode ?? '')
  if (s === '413' || /exceeded the maximum/i.test(e?.message ?? '')) return 'O arquivo passa de 25 MB. Envie um arquivo menor.'
  if (s === '415' || /mime type/i.test(e?.message ?? '')) return 'Esse tipo de arquivo não é aceito. Envie PDF, imagem, Word, Excel ou PowerPoint.'
  if (s === '403' || /row-level security|unauthorized/i.test(e?.message ?? '')) return 'Você não tem permissão para anexar aqui.'
  if (e instanceof TypeError || /fetch/i.test(e?.message ?? '')) return 'Sem conexão. Tente de novo.'
  return 'Não deu para enviar o arquivo. Tente de novo.'
}

const KIND_LABEL: Record<string, string> = { pdf: 'PDF', png: 'IMG', jpg: 'IMG', jpeg: 'IMG', webp: 'IMG', docx: 'DOC', xlsx: 'XLS', pptx: 'PPT' }

type Insert = { insert: Pick<EvidenceRow, 'entity_kind' | 'entity_ref' | 'storage_path' | 'file_name' | 'uploader_role' | 'visible_to_terral'> }
type Toggle = { update: { visible_to_terral: boolean }; match: { id: string } }

/**
 * Files attached to one entity, in both roles: list, upload (button or drop), open through a signed URL that lives
 * 60 s. The file goes to Storage first and the row second; if the row fails the file is removed, if the upload
 * fails no row is written. Don's files are visible to Terral on Terral-visible entities unless the file name names
 * a Don person (then Don-only, with a notice); Don can hide and show each file.
 */
export function Evidence({ entity_kind, entity_ref }: { entity_kind: string; entity_ref: string }) {
  const { role, uid, rows } = useEntityRows('evidence', entity_kind, entity_ref)
  const isDon = role === 'don'
  const share = shareable(entity_kind)
  const qc = useQueryClient()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  const add = useMutate<Insert>('evidence', {
    optimistic: (old, w) => addRow(old, 'evidence', { id: `tmp-${crypto.randomUUID()}`, uploader_name: 'Equipe Don', created_at: new Date().toISOString(), ...w.insert }),
  })
  const toggle = useMutate<Toggle>('evidence', { optimistic: (old, w) => patchRows(old, 'evidence', (r) => r.id === w.match.id, w.update) })
  const list = isDon ? rows : rows.filter((e) => e.visible_to_terral)

  async function upload(f: File) {
    if (!role || !uid) return
    const problem = fileProblem(f)
    if (problem) return setError(problem)
    let visible = isDon ? share : true
    if (isDon && visible && terralTextError(f.name)) {
      visible = false
      toast.show(`"${f.name}" ficou só para a Don: o nome cita alguém da equipe ou horas.`)
    }
    const path = evidencePath({ role, uid, kind: entity_kind, ref: entity_ref, name: f.name })
    const store = supabase.storage.from(BUCKET)
    setBusy(f.name)
    try {
      const up = await store.upload(path, f, { contentType: f.type || TYPES[extOf(f.name)], upsert: false })
      if (up.error) return setError(uploadError(up.error as { message?: string; statusCode?: string }))
      try {
        const data = (await add.mutateAsync({
          insert: { entity_kind, entity_ref, storage_path: path, file_name: f.name.slice(0, 200), uploader_role: role, visible_to_terral: visible },
        })) as EvidenceRow[] | null
        if (!isDon && data?.length) qc.setQueryData<TerralData>(TERRAL_QUERY, (old) => (old ? { ...old, evidence: [...old.evidence, ...data] } : old))
      } catch {
        await store.remove([path]) // no row points at it: take the file back (useMutate already toasted)
      }
    } catch (e) {
      setError(uploadError(e as { message?: string }))
    } finally {
      setBusy(null)
    }
  }

  async function pickAll(files: FileList | null) {
    setError(null)
    for (const f of Array.from(files ?? [])) await upload(f)
    if (input.current) input.current.value = ''
  }

  async function open(e: EvidenceRow) {
    // PDF and images open in a new tab; Office files download (under their own name). The tab is opened before the
    // await so popup blockers see the click, then pointed at the signed URL once it is here.
    const inline = INLINE.has(extOf(e.file_name))
    const tab = inline ? window.open('', '_blank') : null
    const { data, error: err } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(e.storage_path, SIGNED_URL_SECONDS, inline ? undefined : { download: e.file_name })
    if (err || !data) {
      tab?.close()
      return toast.show('Não deu para abrir o arquivo. Tente de novo.', { tone: 'error' })
    }
    if (tab) {
      tab.opener = null
      tab.location.href = data.signedUrl
      return
    }
    // A download, or a blocked popup: a link click never navigates the app itself away.
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.append(a)
    a.click()
    a.remove()
  }

  function flip(e: EvidenceRow) {
    const next = !e.visible_to_terral
    if (next && e.uploader_role === 'don') {
      const problem = terralTextError(e.file_name)
      if (problem) return toast.show(`${problem.replace('este texto', 'o nome do arquivo')} Renomeie e envie de novo.`, { tone: 'error' })
    }
    toggle.mutate({ update: { visible_to_terral: next }, match: { id: e.id } })
  }

  const drop = (ev: DragEvent) => {
    ev.preventDefault()
    setOver(false)
    if (!busy) void pickAll(ev.dataTransfer.files)
  }

  return (
    <div className={over ? 'ev over' : 'ev'} onDragOver={(ev) => { ev.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={drop}>
      {list.length ? (
        <ul className="ev-list" aria-label="Arquivos">
          {list.map((e) => {
            const pending = e.id.startsWith('tmp-')
            return (
              <li key={e.id} className={pending ? 'ev-item pending' : 'ev-item'}>
                <span className="ev-kind" aria-hidden="true">{KIND_LABEL[extOf(e.file_name)] ?? 'ARQ'}</span>
                <span className="ev-main">
                  <button type="button" className="ev-name" disabled={pending} onClick={() => void open(e)} aria-label={`Abrir ${e.file_name}`}>
                    {e.file_name}
                  </button>
                  <span className="ev-meta">
                    {e.uploader_name} · <time dateTime={e.created_at} title={exactTime(e.created_at)}>{pending ? 'enviando…' : relTime(e.created_at)}</time>
                    {isDon && share && !e.visible_to_terral && <Pill tone="mute">Só Don</Pill>}
                  </span>
                </span>
                {isDon && share && !pending && (
                  <button type="button" className="dlink" onClick={() => flip(e)}>
                    {e.visible_to_terral ? 'Ocultar da Terral' : 'Mostrar para a Terral'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="don-quiet">Nenhum arquivo ainda.</p>
      )}

      {role && (
        <div className="ev-up">
          <input id={id} ref={input} type="file" multiple hidden accept={Object.keys(TYPES).map((x) => `.${x}`).join(',')}
            aria-label="Escolher arquivo" onChange={(ev) => void pickAll(ev.target.files)} />
          <button type="button" className="dbtn small" disabled={!!busy} aria-busy={!!busy} onClick={() => input.current?.click()}>
            {busy ? 'Enviando…' : 'Anexar arquivo'}
          </button>
          <span className="dfield-hint" aria-live="polite">
            {busy ? `Enviando "${busy}"…` : 'Ou arraste para cá. PDF, imagem ou Office, até 25 MB.'}
          </span>
        </div>
      )}
      {error && <p className="dfield-error" role="alert">{error}</p>}
    </div>
  )
}
