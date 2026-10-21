import { useState, type FormEvent } from 'react'
import { fmtDate } from '../domain/dates'
import type { Block } from '../domain/types'
import type { DonData } from '../lib/data'
import { FormActions, GuardedField, parseAmount, SelectField, Switch, useTerralGuard } from './fields'
import { BLOCK_TYPES, PROJECT, typeOf, useRowWrites, weekCode } from './plan'

const MAX_H = 24

/**
 * One block in a sheet: description, date, person, hours, type, done. The same editor serves the deliverable detail
 * and the calendar. A new block arrives with a fresh uuid; an edit keeps the id and writes only what changed.
 * Saves are optimistic (the calendar, load and risks move at once) and offer "Desfazer". Delete has no
 * confirmation: the toast undoes it.
 */
export function BlockForm({ block, isNew, data, onDone }: { block: Block; isNew?: boolean; data: DonData; onDone: () => void }) {
  const [description, setDescription] = useState(block.description)
  const [date, setDate] = useState(block.date)
  const [person, setPerson] = useState(block.person_id ?? '')
  const [hours, setHours] = useState(String(block.hours).replace('.', ','))
  const [type, setType] = useState(block.type)
  const [done, setDone] = useState(block.done)
  const [busy, setBusy] = useState(false)
  const guard = useTerralGuard()
  const w = useRowWrites('blocks')
  const win = PROJECT
  const types = BLOCK_TYPES.some((t) => t.type === block.type) ? BLOCK_TYPES : [...BLOCK_TYPES, typeOf(block.type)]
  const people = [...data.people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errors: Record<string, string> = {}
    if (!description.trim()) errors.description = 'Escreva o que fazer neste bloco.'
    if (!date) errors.date = 'Escolha a data.'
    else if (date < win.start || date > win.end) errors.date = `Use uma data do projeto, de ${fmtDate(win.start, true)} a ${fmtDate(win.end, true)}.`
    const h = parseAmount(hours, { min: 0, max: MAX_H })
    if ('error' in h) errors.hours = h.error
    else if (h.value === 0) errors.hours = 'Use mais que 0 h.'
    if (!guard.check({}, errors) || 'error' in h) return

    const row = {
      description: description.trim(), date, week: weekCode(date), person_id: person || null, hours: h.value, type, done,
      done_at: done ? (block.done ? block.done_at : new Date().toISOString()) : null,
    }
    setBusy(true)
    try {
      if (isNew) await w.create({ ...block, ...row }, 'Bloco criado.')
      else {
        const keys = (Object.keys(row) as (keyof typeof row)[]).filter((k) => row[k] !== block[k])
        if (keys.length) {
          await w.update(block.id, Object.fromEntries(keys.map((k) => [k, row[k]])), Object.fromEntries(keys.map((k) => [k, block[k]])), 'Bloco salvo.')
        }
      }
      onDone()
    } catch {
      // useMutate rolled back and said "Não salvou"; the sheet stays open with the draft
    } finally {
      setBusy(false)
    }
  }

  const remove = () => {
    onDone()
    void w.remove(block as unknown as Record<string, unknown>, 'Bloco apagado.').catch(() => {})
  }

  return (
    <form className="dform" ref={guard.ref} onSubmit={(e) => void submit(e)} noValidate>
      <GuardedField guard={guard} name="description" label="O que fazer" multiline required value={description} onChange={setDescription} />
      <div className="dform-two">
        <GuardedField guard={guard} name="date" label="Data" type="date" required value={date} onChange={setDate}
          hint={date && date >= win.start && date <= win.end ? `Semana ${weekCode(date)}` : undefined} />
        <GuardedField guard={guard} name="hours" label="Horas" inputMode="decimal" required value={hours} onChange={setHours} hint="Decimais com vírgula, como 1,5." />
      </div>
      <div className="dform-two">
        <SelectField label="Pessoa" value={person} onChange={setPerson}
          options={[...people.map((p) => ({ value: p.id, label: p.name })), { value: '', label: 'Diretoria Terral (sem pessoa da Don)' }]} />
        <SelectField label="Tipo" value={type} onChange={setType} options={types.map((t) => ({ value: t.type, label: t.type }))} />
      </div>
      <Switch checked={done} onChange={setDone} label="Feito" />
      <FormActions onCancel={onDone} busy={busy} save={isNew ? 'Criar bloco' : 'Salvar'} />
      {!isNew && <button type="button" className="dbtn del" onClick={remove}>Apagar bloco</button>}
    </form>
  )
}
