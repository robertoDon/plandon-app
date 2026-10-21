import { useState, type FormEvent } from 'react'
import { closure } from '../domain/risk'
import type { Deliverable, Dependency, Task, Traceability } from '../domain/types'
import type { DonData } from '../lib/data'
import { Segmented, useToast } from '../ui'
import { Field, FormActions, GuardedField, parseAmount, SelectField, useTerralGuard } from './fields'
import { byCode } from './mutations'
import { newId, useRowWrites } from './plan'

const STATUS: { value: Task['status']; label: string }[] = [
  { value: 'not_started', label: 'Não iniciada' }, { value: 'in_progress', label: 'Em andamento' }, { value: 'done', label: 'Concluída' },
]
export const taskStatusLabel = (s: Task['status']) => STATUS.find((x) => x.value === s)?.label ?? s

const diff = <T extends object>(row: Partial<T>, before: T) => {
  const keys = (Object.keys(row) as (keyof T)[]).filter((k) => row[k] !== before[k])
  return [Object.fromEntries(keys.map((k) => [k, row[k]])), Object.fromEntries(keys.map((k) => [k, before[k]]))] as const
}
const people = (d: DonData) => [...d.people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((p) => ({ value: p.id, label: p.name }))

/**
 * Deleting a task deletes its blocks too (hours live in blocks; orphans would keep counting). One "Desfazer" puts
 * both back. If the task delete fails after its blocks went, the blocks are put back.
 */
export function useDeleteTask() {
  const tasks = useRowWrites('tasks')
  const blocks = useRowWrites('blocks')
  const toast = useToast()
  return async (task: Task, data: DonData) => {
    const bs = data.blocks.filter((b) => b.task_id === task.id)
    if (bs.length) await blocks.run({ delete: { task_id: task.id } })
    try {
      await tasks.run({ delete: { id: task.id } })
    } catch (e) {
      if (bs.length) await blocks.run({ insert: bs as unknown as Record<string, unknown>[] }).catch(() => {})
      throw e
    }
    toast.show(bs.length ? `Tarefa e ${bs.length} ${bs.length === 1 ? 'bloco' : 'blocos'} apagados.` : 'Tarefa apagada.', {
      undo: () => void tasks.run({ insert: task as unknown as Record<string, unknown> })
        .then(() => bs.length && blocks.run({ insert: bs as unknown as Record<string, unknown>[] })).catch(() => {}),
    })
  }
}

/** A task: what, owner, due, kind, status. New tasks take the deliverable's code and front. */
export function TaskForm({ task, isNew, data, onDone }: { task: Task; isNew?: boolean; data: DonData; onDone: () => void }) {
  const [description, setDescription] = useState(task.description)
  const [person, setPerson] = useState(task.person_id ?? '')
  const [due, setDue] = useState(task.due ?? '')
  const [kind, setKind] = useState(task.kind)
  const [status, setStatus] = useState(task.status)
  const [busy, setBusy] = useState(false)
  const guard = useTerralGuard()
  const w = useRowWrites('tasks')
  const del = useDeleteTask()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!guard.check({}, description.trim() ? {} : { description: 'Escreva o que precisa ser feito.' })) return
    const row = { description: description.trim(), person_id: person || null, due: due || null, kind, status }
    setBusy(true)
    try {
      if (isNew) await w.create({ ...task, ...row }, 'Tarefa criada.')
      else {
        const [change, before] = diff(row, task)
        if (Object.keys(change).length) await w.update(task.id, change, before, 'Tarefa salva.')
      }
      onDone()
    } catch {
      /* rolled back with a toast; the draft stays */
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="dform" ref={guard.ref} onSubmit={(e) => void submit(e)} noValidate>
      <GuardedField guard={guard} name="description" label="O que precisa ser feito" multiline required value={description} onChange={setDescription} />
      <div className="dform-two">
        <SelectField label="Responsável" value={person} onChange={setPerson} options={[...people(data), { value: '', label: 'Sem responsável' }]} />
        <Field label="Prazo" type="date" value={due} onChange={setDue} />
      </div>
      <Segmented label="Tipo" value={kind} onChange={setKind} options={[{ value: 'task', label: 'Tarefa' }, { value: 'with_terral', label: 'Com a Terral' }]} />
      <Segmented label="Situação" value={status} onChange={setStatus} options={STATUS} />
      <p className="dnote">As horas da tarefa são a soma dos seus blocos.</p>
      <FormActions onCancel={onDone} busy={busy} save={isNew ? 'Criar tarefa' : 'Salvar'} />
      {!isNew && (
        <button type="button" className="dbtn del" onClick={() => { onDone(); void del(task, data).catch(() => {}) }}>Apagar tarefa e seus blocos</button>
      )}
    </form>
  )
}

/** Name, Terral owner and target ritual are read by Terral: guarded. Planned dates. */
export function DeliverableForm({ d, onDone }: { d: Deliverable; onDone: () => void }) {
  const [name, setName] = useState(d.name)
  const [owner, setOwner] = useState(d.terral_owner ?? '')
  const [ritual, setRitual] = useState(d.target_ritual ?? '')
  const [built, setBuilt] = useState(d.built_date ?? '')
  const [start, setStart] = useState(d.in_use_start ?? '')
  const [end, setEnd] = useState(d.in_use_end ?? '')
  const [busy, setBusy] = useState(false)
  const guard = useTerralGuard()
  const w = useRowWrites('deliverables', 'code')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const extra: Record<string, string> = {}
    if (!name.trim()) extra.name = 'Escreva o nome da entrega.'
    // A single-day use (end = start) whose end was left alone moves with its start.
    const single = d.in_use_start !== null && d.in_use_end === d.in_use_start && end === (d.in_use_end ?? '')
    const endNext = single ? start : end
    if (start && endNext && endNext < start) extra.in_use_end = 'O fim do uso não pode vir antes do início.'
    if (!guard.check({ name, terral_owner: owner, target_ritual: ritual }, extra)) return
    const row = {
      name: name.trim(), terral_owner: owner.trim() || null, target_ritual: ritual.trim() || null,
      built_date: built || null, in_use_start: start || null, in_use_end: endNext || (start || null),
    }
    const [change, before] = diff(row, d)
    // New in-use dates replace the sheet's words and Terral's confirmation: Terral then reads the dates themselves.
    if ('in_use_start' in change || 'in_use_end' in change) {
      Object.assign(change, { in_use_text: null, in_use_confirmed: false })
      Object.assign(before, { in_use_text: d.in_use_text, in_use_confirmed: d.in_use_confirmed })
    }
    setBusy(true)
    try {
      if (Object.keys(change).length) await w.update(d.code, change, before, 'Entrega salva.')
      onDone()
    } catch {
      /* rolled back with a toast */
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="dform" ref={guard.ref} onSubmit={(e) => void submit(e)} noValidate>
      <GuardedField guard={guard} name="name" label="Nome" required value={name} onChange={setName} hint="A Terral lê o nome." />
      <GuardedField guard={guard} name="terral_owner" label="Dono do uso na Terral" value={owner} onChange={setOwner} hint="Uma posição, não uma pessoa da Don." />
      <GuardedField guard={guard} name="target_ritual" label="Rito de destino" value={ritual} onChange={setRitual} />
      <Field label="Construção prevista" type="date" value={built} onChange={setBuilt} />
      <div className="dform-two">
        <Field label="Uso: início" type="date" value={start} onChange={setStart} />
        <GuardedField guard={guard} name="in_use_end" label="Uso: fim" type="date" value={end} onChange={setEnd} />
      </div>
      {d.in_use_text && <p className="dnote">Texto original da planilha: {d.in_use_text}. Mudar as datas troca este texto pelas datas.</p>}
      {d.in_use_confirmed && <p className="dnote">A Terral confirmou esta data. Mudar as datas tira a confirmação.</p>}
      <FormActions onCancel={onDone} busy={busy} />
    </form>
  )
}

type DepKind = Dependency['from_kind']
const KINDS: { value: DepKind; label: string }[] = [
  { value: 'deliverable', label: 'Entrega' }, { value: 'decision', label: 'Decisão' }, { value: 'open_item', label: 'Pendência' }, { value: 'to_schedule', label: 'Agendamento' },
]

/** What a dependency's source reads as: "3.2 Matriz", "D03 Aprovar…", "P-01 Base…". */
export function depLabel(data: DonData, kind: DepKind, ref: string): string {
  const cut = (s: string) => (s.length > 70 ? `${s.slice(0, 69)}…` : s)
  if (kind === 'deliverable') return `${ref} ${data.deliverables.find((x) => x.code === ref)?.name ?? ''}`.trim()
  if (kind === 'decision') return `${ref} ${cut(data.decisions.find((x) => x.code === ref)?.title ?? '')}`.trim()
  if (kind === 'open_item') return `${ref} ${cut(data.open_items.find((x) => x.code === ref)?.text ?? '')}`.trim()
  const t = data.to_schedule.find((x) => x.id === ref)
  return t ? `Agendamento ${t.code}: ${cut(t.what)}` : ref
}

/** Add "this deliverable depends on X". A deliverable → deliverable link that would close a loop is refused. */
export function DependencyForm({ code, data, onDone }: { code: string; data: DonData; onDone: () => void }) {
  const [kind, setKind] = useState<DepKind>('deliverable')
  const [ref, setRef] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const w = useRowWrites('dependencies')
  const taken = new Set(data.dependencies.filter((x) => x.to_code === code && x.from_kind === kind).map((x) => x.from_ref))
  const refs: string[] =
    kind === 'deliverable' ? [...data.deliverables].sort(byCode).map((x) => x.code).filter((c) => c !== code)
    : kind === 'decision' ? [...data.decisions].sort(byCode).map((x) => x.code)
    : kind === 'open_item' ? [...data.open_items].sort(byCode).map((x) => x.code)
    : data.to_schedule.map((x) => x.id)
  const options = refs.filter((r) => !taken.has(r)).map((r) => ({ value: r, label: depLabel(data, kind, r) }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ref) return setError('Escolha o item.')
    if (kind === 'deliverable' && closure([code], data.dependencies).includes(ref))
      return setError(`Isso criaria um ciclo: ${ref} já depende de ${code}.`)
    setBusy(true)
    try {
      await w.create({ id: newId(), from_kind: kind, from_ref: ref, to_code: code, suggested: false }, 'Dependência adicionada.')
      onDone()
    } catch {
      /* rolled back with a toast */
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="dform" onSubmit={(e) => void submit(e)} noValidate>
      <Segmented label="Depende de" value={kind} onChange={(k) => { setKind(k); setRef(''); setError(null) }} options={KINDS} />
      <SelectField label={`${code} depende de`} value={ref} onChange={(v) => { setRef(v); setError(null) }}
        options={[{ value: '', label: options.length ? 'Escolha…' : 'Nada para ligar' }, ...options]} />
      <FormActions onCancel={onDone} busy={busy} save="Adicionar" error={error} />
    </form>
  )
}

/** One Anexo A row (Don-only). */
export function TraceForm({ row, onDone }: { row: Traceability; onDone: () => void }) {
  const [v, setV] = useState({ annex_tab: row.annex_tab, field: row.field, col: row.col, n: String(row.n), task_description: row.task_description, filled_by: row.filled_by })
  const [busy, setBusy] = useState(false)
  const guard = useTerralGuard()
  const w = useRowWrites('traceability')
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const extra: Record<string, string> = {}
    for (const k of ['annex_tab', 'field', 'task_description', 'filled_by'] as const) if (!v[k].trim()) extra[k] = 'Preencha este campo.'
    const n = parseAmount(v.n, { min: 0, max: 999, unit: '' })
    if ('error' in n) extra.n = n.error
    else if (!Number.isInteger(n.value)) extra.n = 'Use um número inteiro.'
    if (!guard.check({}, extra) || 'error' in n) return
    const [change, before] = diff({
      annex_tab: v.annex_tab.trim(), field: v.field.trim(), col: v.col.trim(), n: n.value, task_description: v.task_description.trim(), filled_by: v.filled_by.trim(),
    }, row)
    setBusy(true)
    try {
      if (Object.keys(change).length) await w.update(row.id, change, before, 'Anexo A salvo.')
      onDone()
    } catch {
      /* rolled back with a toast */
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="dform" ref={guard.ref} onSubmit={(e) => void submit(e)} noValidate>
      <div className="dform-two">
        <GuardedField guard={guard} name="annex_tab" label="Aba do Anexo A" required value={v.annex_tab} onChange={set('annex_tab')} />
        <GuardedField guard={guard} name="n" label="Nº" inputMode="decimal" value={v.n} onChange={set('n')} />
      </div>
      <GuardedField guard={guard} name="field" label="Campo" required value={v.field} onChange={set('field')} />
      <GuardedField guard={guard} name="col" label="Coluna" value={v.col} onChange={set('col')} />
      <GuardedField guard={guard} name="task_description" label="Tarefa que produz" multiline required value={v.task_description} onChange={set('task_description')} />
      <GuardedField guard={guard} name="filled_by" label="Quem preenche" required value={v.filled_by} onChange={set('filled_by')} />
      <FormActions onCancel={onDone} busy={busy} />
    </form>
  )
}
