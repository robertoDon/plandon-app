import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { terralErrors } from './forms'
import './don.css'
import './forms.css'

/** Label + input (or textarea) + hint + inline error. 16px text (no zoom on iOS focus), 44px high. */
export function Field({ label, value, onChange, error, hint, type = 'text', multiline, required, disabled, inputMode, name }: {
  label: string; value: string; onChange: (v: string) => void; error?: string | null; hint?: string
  type?: 'text' | 'date'; multiline?: boolean; required?: boolean; disabled?: boolean; inputMode?: 'decimal' | 'text'; name?: string
}) {
  const id = useId()
  const note = `${id}-note`
  const common = {
    id, name, value, disabled, required, 'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hint ? note : undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  }
  return (
    <div className="dfield">
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      {multiline ? <textarea rows={3} {...common} /> : <input type={type} inputMode={inputMode} {...common} />}
      {error ? <p id={note} className="dfield-error" role="alert">{error}</p> : hint ? <p id={note} className="dfield-hint">{hint}</p> : null}
    </div>
  )
}

/** iOS-style switch: a button with role switch, 44px target. */
export function Switch({ checked, onChange, label, hint, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="dswitch">
      <div>
        <span id={id}>{label}</span>
        {hint && <p className="dfield-hint">{hint}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} disabled={disabled} onClick={() => onChange(!checked)}>
        <i aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * Inline errors for a form, with the guard for fields Terral reads. `check(fields, extra)` sets an error per
 * offending field (Terral guard on `fields`, plus any `extra` errors such as required fields), focuses the first
 * invalid field and returns false: the caller then keeps its sheet open. Typing in a field clears its error.
 * Attach `ref` to the <form>; use <GuardedField> (alias TerralField) for the inputs.
 */
export function useTerralGuard() {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (Object.keys(errors).length) ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])
  return {
    errors, ref,
    check(fields: Record<string, string>, extra: Record<string, string> = {}) {
      const e = { ...extra, ...terralErrors(fields) }
      setErrors(e)
      return Object.keys(e).length === 0
    },
    clear(name: string) {
      setErrors((e) => (name in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== name)) : e))
    },
  }
}

type Guard = ReturnType<typeof useTerralGuard>

/** A Field that shows the guard's error for `name` and clears it on edit. For text Terral reads, or any required field. */
export function GuardedField({ name, guard, onChange, ...rest }: Omit<Parameters<typeof Field>[0], 'name' | 'error'> & { name: string; guard: Guard }) {
  return <Field {...rest} name={name} error={guard.errors[name]} onChange={(v) => { guard.clear(name); onChange(v) }} />
}
export const TerralField = GuardedField

/** Cancel + Save row at the end of a sheet form. */
export function FormActions({ onCancel, busy, save = 'Salvar', error }: { onCancel: () => void; busy?: boolean; save?: string; error?: ReactNode }) {
  return (
    <>
      {error && <p className="dform-error" role="alert">{error}</p>}
      <div className="dform-actions">
        <button type="button" className="dbtn" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="dbtn primary" disabled={busy}>{busy ? 'Salvando…' : save}</button>
      </div>
    </>
  )
}

/** Sheet plumbing: `item` is kept until the exit animation ends, so the form does not vanish while it slides out. */
export function useEditor<T>() {
  const [item, setItem] = useState<T | null>(null)
  const [open, setOpen] = useState(false)
  return {
    item,
    show: (x: T) => { setItem(x); setOpen(true) },
    close: () => setOpen(false),
    sheet: (title: string) => ({ open, title, onClose: () => setOpen(false), onClosed: () => setItem(null) }),
  }
}

/**
 * The number rules of NumberEdit, for forms too: decimal comma or point, no thousands separator, within min..max.
 * Empty text is an error here (NumberEdit handles "no value" itself).
 */
export function parseAmount(text: string, { min = 0, max, unit = 'h' }: { min?: number; max: number; unit?: string }): { value: number } | { error: string } {
  const t = text.trim().replace(/\s/g, '')
  if (!t) return { error: 'Digite um valor.' }
  // "1.000" is 1 in code and 1000 to a Brazilian reader: refuse it instead of guessing. Decimals take a comma ("7,5").
  if (/^\d+\.\d{3}$/.test(t)) return { error: 'Escreva sem ponto de milhar. Decimais com vírgula, como 7,5.' }
  const n = /^\d+([.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : NaN
  if (Number.isNaN(n)) return { error: 'Digite um número, como 7,5.' }
  if (n < min || n > max) return { error: `Use um valor de ${String(min).replace('.', ',')} a ${max} ${unit}.` }
  return { value: n }
}

/**
 * A number edited in place. Commits on Enter or blur, only when valid and changed; Escape puts the old value back.
 * Empty means "no value" (null) when `allowEmpty`. The caller's save is optimistic, so the shown value follows `value`.
 */
export function NumberEdit({ label, value, onCommit, min = 0, max, allowEmpty, unit = 'h', validate }: {
  label: string; value: number | null; onCommit: (n: number | null) => void; min?: number; max: number; allowEmpty?: boolean; unit?: string
  /** Extra rule against other fields; returns the message or null. */
  validate?: (n: number) => string | null
}) {
  const shown = (v: number | null) => (v === null ? '' : String(v).replace('.', ','))
  const [text, setText] = useState(shown(value))
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  useEffect(() => { setText(shown(value)); setError(null) }, [value])

  const commit = () => {
    if (!text.trim()) {
      if (!allowEmpty) return setError('Digite um valor.')
      return value === null ? setError(null) : (setError(null), onCommit(null))
    }
    const r = parseAmount(text, { min, max, unit })
    if ('error' in r) return setError(r.error)
    const rule = validate?.(r.value)
    if (rule) return setError(rule)
    setError(null)
    if (r.value !== value) onCommit(r.value)
  }
  return (
    <div className="dfield dnum">
      <label htmlFor={id}>{label}</label>
      <div className="dnum-box">
        <input id={id} type="text" inputMode="decimal" value={text} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : undefined}
          onChange={(e) => { setText(e.target.value); setError(null) }} onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setText(shown(value)); setError(null) }
          }} />
        <span aria-hidden="true">{unit}</span>
      </div>
      {error && <p id={`${id}-e`} className="dfield-error" role="alert">{error}</p>}
    </div>
  )
}

/** Label + native select, styled like Field. */
export function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  const id = useId()
  return (
    <div className="dfield">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
