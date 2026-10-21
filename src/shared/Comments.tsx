import { useId, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMutate } from '../lib/data'
import type { Comment } from '../domain/types'
import type { TerralData } from '../domain/terralView'
import { Pill, useToast } from '../ui'
import { terralTextError } from '../don/forms'
import { Switch } from '../don/fields'
import { addRow, patchRows } from '../don/mutations'
import { exactTime, relTime, shareable, TERRAL_QUERY, useEntityRows } from './entity'
import './shared.css'

export const MAX_COMMENT = 2000

type Insert = { insert: Pick<Comment, 'entity_kind' | 'entity_ref' | 'author_role' | 'body' | 'visible_to_terral'> }
type Toggle = { update: { visible_to_terral: boolean }; match: { id: string } }

/**
 * Comments on one entity, in both roles. Don reads the plan, Terral its own (RLS-filtered) reads; authors show as the
 * server stored them (a Terral user's name, or "Equipe Don"). Don chooses "Visível para a Terral" per comment
 * (on by default; sent explicitly, the column defaults to false) and visible text passes the Terral guard.
 * Terral comments are always visible and not guarded. `canHide` (Don only) adds a hide/show toggle per comment.
 */
export function Comments({ entity_kind, entity_ref, canHide, preview = false }: { entity_kind: string; entity_ref: string; canHide: boolean; preview?: boolean }) {
  // preview: Don looks at Terral's view. Terral's rows, read-only (Don must not write as Terral).
  const { role: who, rows } = useEntityRows('comments', entity_kind, entity_ref, preview)
  const role = preview ? null : who
  const isDon = role === 'don'
  const share = shareable(entity_kind)
  const qc = useQueryClient()
  const toast = useToast()
  const id = useId()
  const box = useRef<HTMLTextAreaElement>(null)
  const [body, setBody] = useState('')
  const [visible, setVisible] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const add = useMutate<Insert>('comment', {
    optimistic: (old, w) => addRow(old, 'comments', { id: `tmp-${crypto.randomUUID()}`, author_name: 'Equipe Don', created_at: new Date().toISOString(), ...w.insert }),
  })
  const toggle = useMutate<Toggle>('comment', { optimistic: (old, w) => patchRows(old, 'comments', (r) => r.id === w.match.id, w.update) })

  // Terral's writes are not in the plan cache: its comment shows from the mutation until the server row is in.
  const draft = !isDon && add.isPending ? add.variables?.insert : undefined
  const list: Comment[] = (isDon ? rows : rows.filter((c) => c.visible_to_terral))
  if (draft) list.push({ ...draft, id: 'tmp-terral', author_name: 'Você', created_at: new Date().toISOString() })

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const text = body.trim()
    if (!text || add.isPending || !role) return
    const vis = isDon ? share && visible : true
    if (isDon && vis) {
      const problem = terralTextError(text)
      if (problem) {
        setError(problem)
        box.current?.focus()
        return
      }
    }
    setError(null)
    setBody('')
    try {
      const data = (await add.mutateAsync({ insert: { entity_kind, entity_ref, author_role: role, body: text, visible_to_terral: vis } })) as Comment[] | null
      if (!isDon && data?.length) {
        qc.setQueryData<TerralData>(TERRAL_QUERY, (old) => (old ? { ...old, comments: [...old.comments, ...data] } : old))
      }
    } catch {
      setBody((now) => now || text) // useMutate rolled back and toasted; the draft comes back
    }
  }

  function flip(c: Comment) {
    const next = !c.visible_to_terral
    if (next && c.author_role === 'don') {
      const problem = terralTextError(c.body)
      if (problem) return toast.show(problem, { tone: 'error' })
    }
    toggle.mutate({ update: { visible_to_terral: next }, match: { id: c.id } })
  }

  return (
    <div className="cm">
      {list.length ? (
        <ul className="cm-list" aria-label="Comentários">
          {list.map((c) => {
            const pending = c.id.startsWith('tmp-')
            return (
              <li key={c.id} className={`cm-item${c.author_role === 'don' ? ' don' : ''}${pending ? ' pending' : ''}`}>
                <div className="cm-hd">
                  <b>{c.author_name}</b>
                  <time dateTime={c.created_at} title={exactTime(c.created_at)}>{pending ? 'enviando…' : relTime(c.created_at)}</time>
                  {isDon && share && !c.visible_to_terral && <Pill tone="mute">Só Don</Pill>}
                </div>
                <p className="cm-body">{c.body}</p>
                {isDon && canHide && share && !pending && (
                  <button type="button" className="dlink cm-flip" onClick={() => flip(c)}>
                    {c.visible_to_terral ? 'Ocultar da Terral' : 'Mostrar para a Terral'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="don-quiet">Nenhum comentário ainda.</p>
      )}
      {preview && <p className="dfield-hint">Na prévia não dá para comentar: só a Terral comenta aqui.</p>}

      {role && (
        <form className="cm-form" onSubmit={submit}>
          <label htmlFor={id} className="ui-sr">Novo comentário</label>
          <textarea id={id} ref={box} rows={2} maxLength={MAX_COMMENT} placeholder="Escreva um comentário" value={body}
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : undefined}
            onChange={(e) => { setBody(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit() }} />
          {error && <p id={`${id}-e`} className="dfield-error" role="alert">{error}</p>}
          {body.length > MAX_COMMENT - 200 && <p className="dfield-hint">{body.length}/{MAX_COMMENT}</p>}
          <div className="cm-actions">
            {isDon && share && (
              <Switch label="Visível para a Terral" checked={visible} onChange={(v) => { setVisible(v); setError(null) }} />
            )}
            <button type="submit" className="dbtn primary small" disabled={!body.trim() || add.isPending}>Comentar</button>
          </div>
        </form>
      )}
    </div>
  )
}
