import { useState, type FormEvent } from 'react'
import type { Deliverable, ManualRisk, Person, Severity } from '../domain/types'
import { useMutate } from '../lib/data'
import { Segmented } from '../ui'
import { SEVERITY } from '../ui'
import { Field, FormActions, GuardedField, SelectField, useTerralGuard } from './fields'
import { addRow } from './mutations'

// created_by is left out: the column defaults to auth.uid()
type Write = { insert: Pick<ManualRisk, 'id' | 'title' | 'severity' | 'links' | 'person_id' | 'status' | 'note'> }

/** Splits "3.1, 3.2 I1" into codes. */
const codesOf = (s: string) => s.split(/[\s,;]+/).filter(Boolean)

/** New manual risk. Not Terral-visible (manual risks are Don-only), so no Terral guard. The row appears at once. */
export function RiskForm({ people, deliverables, onDone }: { people: Person[]; deliverables: Deliverable[]; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [severity, setSeverity] = useState<Severity>('medium')
  const [person, setPerson] = useState('')
  const [links, setLinks] = useState('')
  const [note, setNote] = useState('')
  const guard = useTerralGuard() // focus + inline errors only: manual risks are Don-only, nothing goes through the Terral rules
  const [busy, setBusy] = useState(false)
  const write = useMutate<Write>('manual_risk', { optimistic: (old, w) => addRow(old, 'manual_risks', { ...w.insert, created_by: null }) })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const known = new Set(deliverables.map((d) => d.code))
    const codes = codesOf(links)
    const unknown = codes.filter((c) => !known.has(c))
    const missing: Record<string, string> = {}
    if (!title.trim()) missing.title = 'Escreva o título do risco.'
    if (unknown.length) missing.links = `Não existe entrega com ${unknown.length === 1 ? 'o código' : 'os códigos'} ${unknown.join(', ')}.`
    if (!guard.check({}, missing)) return
    setBusy(true)
    try {
      await write.mutateAsync({
        insert: { id: crypto.randomUUID(), title: title.trim(), severity, links: [...new Set(codes)], person_id: person || null, status: 'open', note: note.trim() || null },
      })
      onDone()
    } catch {
      // useMutate rolled back and showed the toast; the sheet stays open
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="dform" ref={guard.ref} onSubmit={(e) => void submit(e)} noValidate>
      <GuardedField guard={guard} name="title" label="Título" required value={title} onChange={setTitle} />
      <Segmented label="Gravidade" value={severity} onChange={setSeverity}
        options={(['high', 'medium', 'low'] as const).map((s) => ({ value: s, label: SEVERITY[s].label }))} />
      <SelectField label="Pessoa" value={person} onChange={setPerson} options={[{ value: '', label: 'Ninguém em especial' }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
      <GuardedField guard={guard} name="links" label="Entregas afetadas" value={links} onChange={setLinks} hint="Códigos separados por vírgula, como 3.1, 3.2." />
      <Field label="Observação" multiline value={note} onChange={setNote} />
      <FormActions onCancel={onDone} busy={busy} save="Criar risco" />
    </form>
  )
}
