import { useState, type FormEvent } from 'react'
import { fmtDate } from '../domain/dates'
import type { ToSchedule, ToSchedulePlan } from '../domain/types'
import type { DonData } from '../lib/data'
import { useToast } from '../ui'
import { FormActions, GuardedField, parseAmount, SelectField, Switch, useTerralGuard } from './fields'
import { dateError, projectWindow, useRowWrites } from './plan'

const MAX_H = 1000
type Row = Record<string, unknown>

/** The window as Terral reads it ("de 30/11/2026 a 29/01/2027"): rebuilt from the dates when Don moves them. */
export function windowText(start: string, end: string): string | null {
  if (start && end) return `de ${fmtDate(start, true)} a ${fmtDate(end, true)}`
  if (end) return `até ${fmtDate(end, true)}`
  if (start) return `a partir de ${fmtDate(start, true)}`
  return null
}

/** Optimistic "distributed" switch for one plan row, with "Desfazer". */
export function useDistribute() {
  const plans = useRowWrites('to_schedule_plan', 'to_schedule_id')
  const toast = useToast()
  const set = (id: string, distributed: boolean, quiet = false): void => {
    plans.update(id, { distributed }, { distributed: !distributed }, undefined).then(
      () => quiet || toast.show(distributed ? 'Marcada como distribuída.' : 'Voltou para a distribuir.', { undo: () => set(id, !distributed, true) }),
      () => {},
    )
  }
  return set
}

/**
 * Edit one "a agendar" item. Terral reads "o que é", the window text and the confirmed date, so the first two pass the
 * guard. Hours, person and `distributed` live in the Don-only plan row (created here when it is missing).
 * Two tables, two writes: the Don-only plan goes first and is put back if the visible write then fails.
 */
export function ScheduleForm({ item, plan, data, onDone }: { item: ToSchedule; plan: ToSchedulePlan | undefined; data: DonData; onDone: () => void }) {
  const [what, setWhat] = useState(item.what)
  const [start, setStart] = useState(item.window_start ?? '')
  const [end, setEnd] = useState(item.window_end ?? '')
  const [text, setText] = useState(item.window_text ?? '')
  const [confirmed, setConfirmed] = useState(item.confirmed_date ?? '')
  const [hours, setHours] = useState(plan ? String(plan.hours).replace('.', ',') : '')
  const [person, setPerson] = useState(plan?.person_id ?? '')
  const [distributed, setDistributed] = useState(plan?.distributed ?? false)
  const [busy, setBusy] = useState(false)
  const guard = useTerralGuard()
  const items = useRowWrites('to_schedule', 'id')
  const plans = useRowWrites('to_schedule_plan', 'to_schedule_id')
  const toast = useToast()
  const win = projectWindow(data)
  const people = [...data.people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errors: Record<string, string> = {}
    if (!what.trim()) errors.what = 'Escreva o que é para agendar.'
    for (const [name, v, was] of [['start', start, item.window_start], ['end', end, item.window_end], ['confirmed', confirmed, item.confirmed_date]] as const)
      if (v && v !== (was ?? '')) {
        const bad = dateError(v, win)
        if (bad) errors[name] = bad
      }
    if (!errors.start && !errors.end && start && end && end < start) errors.end = 'A janela não pode terminar antes de começar.'
    const h = hours.trim() || plan ? parseAmount(hours, { min: 0, max: MAX_H }) : null
    if (h && 'error' in h) errors.hours = h.error
    // the text Terral reads; the window text is guarded as typed
    if (!guard.check({ what, window_text: text }, errors)) return

    // Moving the dates without touching the text: Terral reads the text, so it follows the dates.
    const datesMoved = start !== (item.window_start ?? '') || end !== (item.window_end ?? '')
    const nextText = datesMoved && text.trim() === (item.window_text ?? '') ? windowText(start, end) : text.trim() || null
    const after: Row = { what: what.trim(), window_start: start || null, window_end: end || null, window_text: nextText, confirmed_date: confirmed || null }
    const itemKeys = Object.keys(after).filter((k) => after[k] !== item[k as keyof ToSchedule])
    const planAfter: Row = { person_id: person || null, hours: h && 'value' in h ? h.value : 0, distributed }
    const planKeys = plan ? Object.keys(planAfter).filter((k) => planAfter[k] !== plan[k as keyof ToSchedulePlan]) : h || distributed || person ? Object.keys(planAfter) : []
    if (!itemKeys.length && !planKeys.length) return onDone()

    setBusy(true)
    let planWritten = false
    const pick = (o: Row, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k]]))
    const planBefore = plan ? pick(plan as unknown as Row, planKeys) : {}
    const itemBefore = pick(item as unknown as Row, itemKeys)
    try {
      if (planKeys.length) {
        if (plan) await plans.run({ update: pick(planAfter, planKeys), match: { to_schedule_id: item.id } })
        else await plans.run({ insert: { to_schedule_id: item.id, ...planAfter } })
        planWritten = true
      }
      if (itemKeys.length) await items.run({ update: pick(after, itemKeys), match: { id: item.id } })
      const undo = () => {
        const quiet = (p: Promise<unknown>) => void p.catch(() => {})
        if (itemKeys.length) quiet(items.run({ update: itemBefore, match: { id: item.id } }))
        if (planKeys.length) quiet(plan ? plans.run({ update: planBefore, match: { to_schedule_id: item.id } }) : plans.run({ delete: { to_schedule_id: item.id } }))
      }
      toast.show('Agendamento salvo.', { undo })
      onDone()
    } catch {
      // useMutate rolled the failed write back and said "Não salvou"; put the Don-only row back too, keep the draft
      if (planWritten) await (plan ? plans.run({ update: planBefore, match: { to_schedule_id: item.id } }) : plans.run({ delete: { to_schedule_id: item.id } })).catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  const dateField = (name: string, label: string, v: string, set: (v: string) => void, hint?: string) => (
    <GuardedField guard={guard} name={name} label={label} type="date" value={v} onChange={set} hint={hint} />
  )

  return (
    <form className="dform" ref={guard.ref} onSubmit={(e) => void submit(e)} noValidate>
      <GuardedField guard={guard} name="what" label="O que é" multiline required value={what} onChange={setWhat} />
      <div className="dform-two">
        {dateField('start', 'Janela: início', start, setStart)}
        {dateField('end', 'Janela: fim', end, setEnd)}
      </div>
      <GuardedField guard={guard} name="window_text" label="Janela (texto que a Terral lê)" value={text} onChange={setText}
        hint="Se você só mexer nas datas, este texto acompanha." />
      {dateField('confirmed', 'Data confirmada', confirmed, setConfirmed, 'Esvazie o campo para tirar a confirmação.')}
      <div className="dform-two">
        <GuardedField guard={guard} name="hours" label="Horas" inputMode="decimal" value={hours} onChange={setHours} hint="Só a Don vê. Decimais com vírgula, como 7,5." />
        <SelectField label="Quem conduz" value={person} onChange={setPerson}
          options={[{ value: '', label: 'Sem pessoa' }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
      </div>
      <Switch checked={distributed} onChange={setDistributed} label="Distribuída em blocos"
        hint="Ligue quando as horas já estiverem nos blocos do calendário. Elas deixam de contar como a agendar." />
      <FormActions onCancel={onDone} busy={busy} />
    </form>
  )
}
