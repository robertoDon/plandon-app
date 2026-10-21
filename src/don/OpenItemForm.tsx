import { useState, type FormEvent } from 'react'
import type { OpenItem } from '../domain/types'
import { useMutate } from '../lib/data'
import { Segmented } from '../ui'
import { Field, FormActions, GuardedField, Switch, useTerralGuard } from './fields'
import { patchRows } from './mutations'

type ItemWrite = { update: Record<string, unknown>; match: { code: string } }
type InternalWrite = { upsert: { code: string; owner_raw: string } }

/** Optimistic open-item write: the cache row follows the write at once; an error rolls it back. */
export const useOpenItemWrite = () =>
  useMutate<ItemWrite>('open_item', { optimistic: (old, w) => patchRows(old, 'open_items', (r) => r.code === w.match.code, w.update) })

/**
 * Edit one P-item or X-item. Terral reads text, effect and owner_public of a visible item, so those pass the guard
 * before the save when the item is (or becomes) visible. An X-item (divergência) is never visible: the switch is locked.
 */
export function OpenItemForm({ item, ownerRaw, onDone }: { item: OpenItem; ownerRaw: string; onDone: () => void }) {
  const [text, setText] = useState(item.text)
  const [ownerPublic, setOwnerPublic] = useState(item.owner_public)
  const [raw, setRaw] = useState(ownerRaw)
  const [due, setDue] = useState(item.due ?? '')
  const [effect, setEffect] = useState(item.effect ?? '')
  const [status, setStatus] = useState(item.status)
  const [visible, setVisible] = useState(item.visible_to_terral)
  const [busy, setBusy] = useState(false)
  const guard = useTerralGuard()
  const write = useOpenItemWrite()
  const internal = useMutate<InternalWrite>('open_item_internal', {
    optimistic: (old, w) => {
      const has = old.open_items_internal.some((r) => r.code === w.upsert.code)
      return { ...old, open_items_internal: has ? old.open_items_internal.map((r) => (r.code === w.upsert.code ? w.upsert : r)) : [...old.open_items_internal, w.upsert] }
    },
  })
  const x = item.kind === 'divergencia'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const missing: Record<string, string> = {}
    if (!text.trim()) missing.text = 'Escreva o texto.'
    if (!ownerPublic.trim()) missing.owner_public = 'Diga quem é o responsável.'
    if (!guard.check(visible && !x ? { text, effect, owner_public: ownerPublic } : {}, missing)) return
    setBusy(true)
    // Two tables, two writes. The Don-only one goes first: if the visible one then fails, it is put back, so a
    // failed save leaves nothing half-saved (and Terral never sees a change without its owner_raw).
    const rawChanged = raw.trim() !== ownerRaw
    let rawWritten = false
    try {
      if (rawChanged) {
        await internal.mutateAsync({ upsert: { code: item.code, owner_raw: raw.trim() } })
        rawWritten = true
      }
      await write.mutateAsync({
        update: {
          text: text.trim(), owner_public: ownerPublic.trim(), due: due || null, effect: effect.trim() || null, status,
          visible_to_terral: x ? false : visible,
          ...(due && due !== item.due ? { due_text: null } : {}),
        },
        match: { code: item.code },
      })
      onDone()
    } catch {
      // useMutate rolled the failed write back and showed "Não salvou"; the sheet stays open with the draft
      if (rawWritten) await internal.mutateAsync({ upsert: { code: item.code, owner_raw: ownerRaw } }).catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="dform" ref={guard.ref} onSubmit={(e) => void submit(e)} noValidate>
      <Segmented label="Situação" value={status} onChange={setStatus} options={[{ value: 'open', label: 'Aberta' }, { value: 'resolved', label: 'Resolvida' }]} />
      <GuardedField guard={guard} name="text" label="Texto" multiline required value={text} onChange={setText} />
      <GuardedField guard={guard} name="owner_public" label="Responsável (como a Terral vê)" required value={ownerPublic} onChange={setOwnerPublic} hint="Uma posição, não uma pessoa da Don." />
      <Field label="Responsável de verdade (só a Don vê)" value={raw} onChange={setRaw} />
      <div className="dform-two">
        <Field label="Prazo" type="date" value={due} onChange={setDue} hint={item.due_text && !item.due ? `Texto original: ${item.due_text}` : undefined} />
      </div>
      <GuardedField guard={guard} name="effect" label="Efeito" multiline value={effect} onChange={setEffect} />
      <Switch checked={x ? false : visible} onChange={setVisible} disabled={x} label="Visível para a Terral"
        hint={x ? 'Divergências ficam só com a Don. A Terral nunca vê.' : 'A Terral lê o texto, o responsável, o prazo e o efeito.'} />
      <FormActions onCancel={onDone} busy={busy} />
    </form>
  )
}
