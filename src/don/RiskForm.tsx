import { useState, type FormEvent } from 'react'
import type { Deliverable, ManualRisk, Person, Severity } from '../domain/types'
import { useMutate } from '../lib/data'
import { Segmented } from '../ui'
import { SEVERITY } from '../ui'
import { Field, FormActions, SelectField } from './fields'
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
  const [errors, setErrors] = useState<{ title?: string; links?: string }>({})
  const [busy, setBusy] = useState(false)
  const write = useMutate<Write>('manual_risk', { optimistic: (old, w) => addRow(old, 'manual_risks', { ...w.insert, created_by: null }) })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const known = new Set(deliverables.map((d) => d.code))
    const codes = codesOf(links)
    const unknown = codes.filter((c) => !known.has(c))
    const next = {
      title: title.trim() ? undefined : 'Escreva o título do risco.',
      links: unknown.length ? `Não existe entrega com ${unknown.length === 1 ? 'o código' : 'os códigos'} ${unknown.join(', ')}.` : undefined,
    }
    setErrors(next)
    if (next.title || next.links) return
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
    <form className="dform" onSubmit={(e) => void submit(e)} noValidate>
      <Field label="Título" required value={title} onChange={(v) => { setErrors((x) => ({ ...x, title: undefined })); setTitle(v) }} error={errors.title} />
      <Segmented label="Gravidade" value={severity} onChange={setSeverity}
        options={(['high', 'medium', 'low'] as const).map((s) => ({ value: s, label: SEVERITY[s].label }))} />
      <SelectField label="Pessoa" value={person} onChange={setPerson} options={[{ value: '', label: 'Ninguém em especial' }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
      <Field label="Entregas afetadas" value={links} onChange={(v) => { setErrors((x) => ({ ...x, links: undefined })); setLinks(v) }} error={errors.links} hint="Códigos separados por vírgula, como 3.1, 3.2." />
      <Field label="Observação" multiline value={note} onChange={setNote} />
      <FormActions onCancel={onDone} busy={busy} save="Criar risco" />
    </form>
  )
}
