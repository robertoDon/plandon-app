import { useId, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fmtDate, type ISODate } from '../domain/dates'
import type { TerralData } from '../domain/terralView'
import { findForbidden } from '../domain/textGuard'
import type { Decision } from '../domain/types'
import { useMutate } from '../lib/data'
import { TERRAL_QUERY } from '../shared/entity'
import { Sheet, useToast } from '../ui'
import { Field } from '../don/fields'
import { useToday } from '../shared/useToday'
import { isIsoDate } from './model'

// Terral's two writes, both RPCs (0002/0004): confirm_date(p_kind, p_ref, p_date) and
// record_decision(p_code, p_outcome, p_decided_by, p_decided_at).

/** pt-BR text for an RPC error, by Postgres code. */
export function rpcError(e: unknown): string {
  const { code, message = '' } = (e ?? {}) as { code?: string; message?: string }
  if (e instanceof TypeError) return 'Sem conexão. Tente de novo.'
  if (code === '42501' && /already decided/i.test(message)) return 'Esta decisão já foi registrada. Para mudar, fale com a Equipe Don.'
  if (code === '42501') return 'Sua conta não tem permissão para isso.'
  if (code === '22023' && /required/i.test(message)) return 'Preencha o que foi decidido, quem decidiu e a data.'
  if (code === '22004') return 'Escolha uma data.'
  if (code === '22007' || code === '22008') return 'Essa data não existe. Confira o dia, o mês e o ano.'
  if (code === 'P0002') return 'Não encontramos este item. Recarregue a página.'
  return 'Não salvou. Tente de novo.'
}

export interface DateTarget { kind: 'deliverable' | 'to_schedule'; ref: string; title: string; hint?: string; initial: ISODate | null }

type Cache = TerralData | undefined
/** Writes the confirmed date into Terral's cache (the shape confirm_date gives the row), or puts `prev` back. */
function patch(old: Cache, t: DateTarget, date: ISODate, prev?: unknown): Cache {
  if (!old) return old
  if (t.kind === 'deliverable') {
    return { ...old, deliverables: old.deliverables.map((d) => d.code !== t.ref ? d
      : prev ? (prev as typeof d) : { ...d, in_use_start: date, in_use_end: date, in_use_confirmed: true }) }
  }
  return { ...old, to_schedule: old.to_schedule.map((s) => s.id !== t.ref ? s : prev ? (prev as typeof s) : { ...s, confirmed_date: date }) }
}

/**
 * "Confirmar data": a small sheet with one date. The new date shows at once ("data confirmada"); a failure puts the
 * old row back and the toast says "Não salvou. Tente de novo.". It never marks anything in use: only Don does that.
 */
export function useConfirmDate() {
  const qc = useQueryClient()
  const toast = useToast()
  const write = useMutate<{ rpc: { p_kind: string; p_ref: string; p_date: string } }>('confirm_date', { silent: true })
  const [target, setTarget] = useState<DateTarget | null>(null)
  const [open, setOpen] = useState(false)

  async function confirm(t: DateTarget, date: ISODate) {
    setOpen(false)
    await qc.cancelQueries({ queryKey: TERRAL_QUERY }) // a refetch landing now would wipe the optimistic date
    const old = qc.getQueryData<TerralData>(TERRAL_QUERY)
    const prev = t.kind === 'deliverable' ? old?.deliverables.find((d) => d.code === t.ref) : old?.to_schedule.find((s) => s.id === t.ref)
    qc.setQueryData<TerralData>(TERRAL_QUERY, (o) => patch(o, t, date))
    try {
      await write.mutateAsync({ rpc: { p_kind: t.kind, p_ref: t.ref, p_date: date } })
      toast.show(`Data confirmada: ${fmtDate(date, true)}.`)
    } catch (e) {
      if (prev) qc.setQueryData<TerralData>(TERRAL_QUERY, (o) => patch(o, t, date, prev))
      toast.show(rpcError(e), { tone: 'error' })
    }
  }

  return {
    ask: (t: DateTarget) => { setTarget(t); setOpen(true) },
    sheet: (
      <Sheet open={open} onClose={() => setOpen(false)} onClosed={() => setTarget(null)} title="Confirmar data">
        {target && <DateForm key={`${target.kind}:${target.ref}`} target={target} onCancel={() => setOpen(false)} onSubmit={(d) => void confirm(target, d)} />}
      </Sheet>
    ),
  }
}

function DateForm({ target, onCancel, onSubmit }: { target: DateTarget; onCancel: () => void; onSubmit: (d: ISODate) => void }) {
  const [date, setDate] = useState(target.initial ?? '')
  const [error, setError] = useState<string | null>(null)
  const today = useToday()
  // a past date is allowed (confirm_date accepts it, e.g. to record what already happened), but say so
  const past = isIsoDate(date) && date < today
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!date) return setError('Escolha uma data.')
    if (!isIsoDate(date)) return setError('Essa data não existe. Confira o dia, o mês e o ano.')
    onSubmit(date)
  }
  return (
    <form className="dform" onSubmit={submit} noValidate>
      <p className="t-form-lead">{target.title}</p>
      <DateField label="Data combinada" value={date} onChange={(v) => { setDate(v); setError(null) }} error={error}
        warn={past ? 'Essa data já passou. Confirme só se foi isso mesmo que ficou combinado.' : undefined}
        hint={target.hint ?? 'A Equipe Don organiza a agenda a partir desta data.'} />
      <div className="dform-actions">
        <button type="button" className="dbtn" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="dbtn primary">Confirmar</button>
      </div>
    </form>
  )
}

/** A required date input. `max` keeps the year to 4 digits (Chrome accepts 6 otherwise) and caps it. */
function DateField({ label, value, onChange, error, warn, hint, max = '9999-12-31' }: {
  label: string; value: string; onChange: (v: string) => void; error?: string | null; warn?: string; hint?: string; max?: string
}) {
  const id = useId()
  const note = `${id}-note`
  return (
    <div className="dfield">
      <label htmlFor={id}>{label}<span aria-hidden="true"> *</span></label>
      <input id={id} type="date" required min="2000-01-01" max={max} value={value} onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined} aria-describedby={error || hint ? note : undefined} />
      {error ? <p id={note} className="dfield-error" role="alert">{error}</p> : hint ? <p id={note} className="dfield-hint">{hint}</p> : null}
      {!error && warn && <p className="t-warn" role="status">{warn}</p>}
    </div>
  )
}

/**
 * "Registrar decisão": what was decided, who decided (a position) and when. Calls record_decision with the values
 * as typed (trimmed). "Quem decidiu" is shown to everyone, so it may not name a Don person or carry hours.
 */
export function DecisionForm({ decision, today, onDone }: { decision: Decision; today: ISODate; onDone: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const write = useMutate<{ rpc: { p_code: string; p_outcome: string; p_decided_by: string; p_decided_at: string } }>('record_decision', { silent: true })
  const [outcome, setOutcome] = useState('')
  const [by, setBy] = useState('')
  const [at, setAt] = useState(today)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const err: Record<string, string> = {}
    if (!outcome.trim()) err.outcome = 'Escreva o que foi decidido.'
    if (!by.trim()) err.by = 'Diga quem decidiu, por posição. Exemplo: Diretoria executiva.'
    else if (findForbidden(by).length) err.by = 'Use a posição de quem decidiu, como Diretoria executiva, sem nomes de pessoas nem horas.'
    if (!at) err.at = 'Informe a data da decisão.'
    else if (!isIsoDate(at)) err.at = 'Essa data não existe. Confira o dia, o mês e o ano.'
    else if (at > today) err.at = 'A data não pode ser depois de hoje.'
    setErrors(err)
    setFailed(null)
    if (Object.keys(err).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.t-decision-form [aria-invalid="true"]')?.focus())
      return
    }
    const vals = { p_code: decision.code, p_outcome: outcome.trim(), p_decided_by: by.trim(), p_decided_at: at }
    try {
      await write.mutateAsync({ rpc: vals })
      qc.setQueryData<TerralData>(TERRAL_QUERY, (o) => o && {
        ...o, decisions: o.decisions.map((d) => d.code === decision.code ? { ...d, status: 'decided', outcome: vals.p_outcome, decided_by: vals.p_decided_by, decided_at: at } : d),
      })
      toast.show(`Decisão ${decision.code} registrada.`)
      onDone()
    } catch (x) {
      setFailed(rpcError(x))
    }
  }

  return (
    <form className="dform t-decision-form" onSubmit={(e) => void submit(e)} noValidate>
      <p className="t-form-lead"><b>{decision.code}</b> · {decision.title}</p>
      <Field label="O que foi decidido" multiline required value={outcome} error={errors.outcome} onChange={(v) => { setOutcome(v); setErrors(({ outcome: _, ...r }) => r) }} />
      <Field label="Quem decidiu" required value={by} error={errors.by} hint="Uma posição, como Diretoria executiva." onChange={(v) => { setBy(v); setErrors(({ by: _, ...r }) => r) }} />
      <DateField label="Data da decisão" value={at} error={errors.at} max={today} onChange={(v) => { setAt(v); setErrors(({ at: _, ...r }) => r) }} />
      <p className="dfield-hint">Depois de registrada, só a Equipe Don pode mudar a decisão.</p>
      {failed && <p className="dform-error" role="alert">{failed}</p>}
      <div className="dform-actions">
        <button type="button" className="dbtn" onClick={onDone}>Cancelar</button>
        <button type="submit" className="dbtn primary" disabled={write.isPending}>{write.isPending ? 'Registrando…' : 'Registrar'}</button>
      </div>
    </form>
  )
}
