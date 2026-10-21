import { useState, type FormEvent } from 'react'
import { today } from '../domain/dates'
import type { Decision } from '../domain/types'
import { useMutate } from '../lib/data'
import { Segmented } from '../ui'
import { Field, FormActions, GuardedField, useTerralGuard } from './fields'
import { decisionErrors } from './forms'
import { patchRows } from './mutations'

type Write = { update: Record<string, unknown>; match: { code: string } }

/**
 * Edit every field of a decision. Status "decided" needs an outcome, who decided and when (the record_decision rules).
 * Terral reads the whole decision, so title, outcome and decided_by pass the guard.
 */
export function DecisionForm({ decision: d, prepHours, onDone }: { decision: Decision; prepHours: string | null; onDone: () => void }) {
  const [title, setTitle] = useState(d.title)
  const [date, setDate] = useState(d.date ?? '')
  const [preparedOn, setPreparedOn] = useState(d.prepared_on ?? '')
  const [status, setStatus] = useState(d.status)
  const [outcome, setOutcome] = useState(d.outcome ?? '')
  const [by, setBy] = useState(d.decided_by ?? '')
  const [at, setAt] = useState(d.decided_at ?? '')
  const [busy, setBusy] = useState(false)
  const guard = useTerralGuard()
  const write = useMutate<Write>('decision', { optimistic: (old, w) => patchRows(old, 'decisions', (r) => r.code === w.match.code, w.update) })
  const decided = status === 'decided'

  const pick = (s: Decision['status']) => {
    setStatus(s)
    guard.clear('outcome')
    if (s === 'decided' && !at) setAt(today())
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const missing = { ...(title.trim() ? {} : { title: 'Escreva o título.' }), ...decisionErrors({ status, outcome, decided_by: by, decided_at: at }) }
    if (!guard.check(decided ? { title, outcome, decided_by: by } : { title }, missing)) return
    setBusy(true)
    try {
      await write.mutateAsync({
        update: {
          title: title.trim(), date: date || null, prepared_on: preparedOn || null, status,
          outcome: decided ? outcome.trim() : null, decided_by: decided ? by.trim() : null, decided_at: decided ? at : null,
        },
        match: { code: d.code },
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
      <Segmented label="Situação" value={status} onChange={pick} options={[{ value: 'pending', label: 'Pendente' }, { value: 'decided', label: 'Decidida' }]} />
      {d.status === 'decided' && !decided && <p className="dnote">Voltar para pendente apaga o resultado, quem decidiu e a data. O histórico guarda o que havia.</p>}
      <GuardedField guard={guard} name="title" label="Título" required value={title} onChange={setTitle} />
      <div className="dform-two">
        <Field label="Data da reunião" type="date" value={date} onChange={setDate} />
        <Field label="Preparar até" type="date" value={preparedOn} onChange={setPreparedOn} hint={prepHours ? `Preparação: ${prepHours}` : undefined} />
      </div>
      {decided && (
        <>
          <GuardedField guard={guard} name="outcome" label="Resultado" multiline required value={outcome} onChange={setOutcome} />
          <div className="dform-two">
            <GuardedField guard={guard} name="decided_by" label="Quem decidiu" required value={by} onChange={setBy} hint="Uma posição, como Diretoria Terral." />
            <GuardedField guard={guard} name="decided_at" label="Data da decisão" type="date" required value={at} onChange={setAt} />
          </div>
        </>
      )}
      <FormActions onCancel={onDone} busy={busy} />
    </form>
  )
}
