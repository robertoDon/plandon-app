import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring } from './motion'
import './toast.css'

// Minimal toast: one at a time, ~5 s, optional action ("Desfazer"). T8 may restyle.
export interface ToastOpts {
  action?: { label: string; onClick: () => void }
  tone?: 'error' | 'info'
}
type Toast = ToastOpts & { id: number; message: string }
type Show = (message: string, opts?: ToastOpts) => void

const Ctx = createContext<Show | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const next = useRef(0)
  const show = useCallback<Show>((message, opts = {}) => setToast({ id: ++next.current, message, ...opts }), [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 5000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              className={`toast${toast.tone === 'error' ? ' toast-error' : ''}`}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={spring}
            >
              <span>{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action!.onClick()
                    setToast(null)
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): Show {
  const show = useContext(Ctx)
  if (!show) throw new Error('useToast outside ToastProvider')
  return show
}
