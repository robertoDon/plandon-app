import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { spring } from '../lib/motion'

export interface ToastOpts {
  /** Adds a "Desfazer" button that calls this and closes the toast. */
  undo?: () => void
  /** Time on screen; default 5000. Paused while the pointer or focus is on the toasts. */
  ms?: number
  tone?: 'error'
}
type Item = ToastOpts & { id: number; msg: string }
interface Api { show(msg: string, opts?: ToastOpts): void }

const MAX = 3
const Ctx = createContext<Api | null>(null)

// A modal <dialog> makes the page under it inert, so an undo toast there could not be clicked. Open sheets
// register here and the toasts render inside the topmost one.
const layers: HTMLElement[] = []
const subs = new Set<() => void>()
const notify = () => subs.forEach((f) => f())
export function enterToastLayer(el: HTMLElement): () => void {
  layers.push(el)
  notify()
  return () => {
    layers.splice(layers.indexOf(el), 1)
    notify()
  }
}
const subscribe = (cb: () => void) => {
  subs.add(cb)
  return () => void subs.delete(cb)
}
const useLayer = () => useSyncExternalStore(subscribe, () => layers.at(-1) ?? null, () => null)

/** One host at the app root. Newest at the bottom, at most 3, above the phone tab bar and the safe area. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const [paused, setPaused] = useState(false)
  const next = useRef(0)
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), [])
  const api = useMemo<Api>(() => ({
    show: (msg, opts = {}) => setItems((xs) => [...xs, { id: ++next.current, msg, ...opts }].slice(-MAX)),
  }), [])
  // A toast removed under the pointer or with focus fires no leave/blur: unpause once the stack is empty.
  useEffect(() => { if (!items.length) setPaused(false) }, [items.length])

  const layer = useLayer()
  const region = (
    <div className="ui-toasts" role="status" aria-live="polite"
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <AnimatePresence initial={false}>
        {items.map((t) => <Toast key={t.id} t={t} paused={paused} dismiss={dismiss} />)}
      </AnimatePresence>
    </div>
  )
  return (
    <Ctx.Provider value={api}>
      {children}
      {layer ? createPortal(region, layer) : region}
    </Ctx.Provider>
  )
}

function Toast({ t, paused, dismiss }: { t: Item; paused: boolean; dismiss: (id: number) => void }) {
  const left = useRef(t.ms ?? 5000)
  useEffect(() => {
    if (paused) return
    const start = Date.now()
    const timer = setTimeout(() => dismiss(t.id), left.current)
    return () => {
      clearTimeout(timer)
      left.current -= Date.now() - start
    }
  }, [paused, t.id, dismiss])

  return (
    <motion.div layout className={t.tone === 'error' ? 'ui-toast error' : 'ui-toast'}
      initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }} transition={spring}>
      <span>{t.msg}</span>
      {t.undo && (
        <button type="button" onClick={() => { t.undo!(); dismiss(t.id) }}>Desfazer</button>
      )}
    </motion.div>
  )
}

export function useToast(): Api {
  const api = useContext(Ctx)
  if (!api) throw new Error('useToast outside ToastProvider')
  return api
}
