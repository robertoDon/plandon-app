import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { spring } from '../lib/motion'
import './auth.css'

/** The calm centered card every auth screen uses, with the Don mark. */
export function AuthCard({ title, sub, children, footer }: { title: string; sub?: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth">
      <motion.div className="auth-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <div className="auth-mark" aria-hidden="true">DON</div>
        <div className="auth-eyebrow">PlanDon · Terral</div>
        <h1>{title}</h1>
        {sub && <p className="auth-sub">{sub}</p>}
        {children}
      </motion.div>
      {footer && <div className="auth-footer">{footer}</div>}
    </div>
  )
}

export function Field({ label, hint, error, ...input }: { label: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  const note = error || hint
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={!!error} aria-describedby={note ? `${id}-note` : undefined} {...input} />
      {note && <div id={`${id}-note`} className={error ? 'field-error' : 'field-hint'}>{note}</div>}
    </div>
  )
}

export function Submit({ busy, children, busyText }: { busy: boolean; children: ReactNode; busyText: string }) {
  return (
    <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy}>
      {busy ? busyText : children}
    </button>
  )
}

export function FormError({ children }: { children?: string }) {
  return children ? <div className="form-error" role="alert">{children}</div> : null
}

/** Async submit with a busy flag and one error message. */
export function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const submit = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setError(undefined)
    try {
      const msg = await fn()
      if (msg) setError(msg)
    } catch {
      setError('Sem conexão com o servidor. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

export const MIN_PASSWORD = 8
