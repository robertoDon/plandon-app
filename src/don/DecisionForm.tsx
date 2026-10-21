import { useState, type FormEvent } from 'react'
import { today } from '../domain/dates'
import type { Decision } from '../domain/types'
import { useMutate } from '../lib/data'
import { Segmented } from '../ui'
import { Field, FormActions, TerralField, useTerralGuard } from './fields'
import { validateDecision } from './forms'
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
  const [problem, setProblem] = useState<string | null>(null)
  const [titleError, setTitleError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const guard = useTerralGuard()
  const write = useMutate<Write>('decision', { optimistic: (old, w) => patchRows(old, 'decisions', (r) => r.code === w.match.code, w.update) })
  const decided = status === 'decided'

  const pick = (s: Decision['status']) => {
    setStatus(s)
    setProblem(null)
    if (s === 'decided' && !at) setAt(today())
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTitleError(title.trim() ? undefined : 'Escreva o título.')
    const rule = validateDecision({ status, outcome, decided_by: by, decided_at: at })
    setProblem(rule)
    const clean = guard.check(decided ? { title, outcome, decided_by: by } : { title })
    if (!title.trim() || rule || !clean) return
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
      <TerralField guard={guard} name="title" label="Título" required value={title} onChange={(v) => { setTitleError(undefined); setTitle(v) }} error={titleError} />
      <div className="dform-two">
        <Field label="Data da reunião" type="date" value={date} onChange={setDate} />
        <Field label="Preparar até" type="date" value={preparedOn} onChange={setPreparedOn} hint={prepHours ? `Preparação: ${prepHours}` : undefined} />
      </div>
      {decided && (
        <>
          <TerralField guard={guard} name="outcome" label="Resultado" multiline required value={outcome} onChange={(v) => { setProblem(null); setOutcome(v) }} />
          <div className="dform-two">
            <TerralField guard={guard} name="decided_by" label="Quem decidiu" required value={by} onChange={(v) => { setProblem(null); setBy(v) }} hint="Uma posição, como Diretoria Terral." />
            <Field label="Data da decisão" type="date" required value={at} onChange={(v) => { setProblem(null); setAt(v) }} />
          </div>
        </>
      )}
      <FormActions onCancel={onDone} busy={busy} error={problem} />
    </form>
  )
}
