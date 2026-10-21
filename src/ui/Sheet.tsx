import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { motion, useAnimationControls, useDragControls, useReducedMotion } from 'motion/react'
import { spring } from '../lib/motion'
import { enterToastLayer } from './Toast'

const WIDE = '(min-width: 900px)'
const subscribe = (cb: () => void) => {
  const m = window.matchMedia?.(WIDE)
  m?.addEventListener('change', cb)
  return () => m?.removeEventListener('change', cb)
}
const useWide = () => useSyncExternalStore(subscribe, () => !!window.matchMedia?.(WIDE).matches, () => true)

/**
 * Modal sheet on a native <dialog> (focus trap, Esc, inert page). From 900px it slides in from the right; below,
 * it rises from the bottom and can be dragged down to close. It leaves along the path it came, springs are
 * interruptible (reopen mid-close continues from where it is), reduced motion cross-fades. Focus returns to the
 * opener. `onClosed` runs once the exit has finished.
 */
export function Sheet({ open, onClose, title, children, onClosed }: { open: boolean; onClose: () => void; title: string; children?: ReactNode; onClosed?: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const leaveLayer = useRef<(() => void) | null>(null)
  const sheet = useAnimationControls()
  const drag = useDragControls()
  const reduce = useReducedMotion()
  const side = useWide()
  const id = useId()
  const variants = {
    open: { x: 0, y: 0, opacity: 1 },
    closed: reduce ? { x: 0, y: 0, opacity: 0 } : side ? { x: '110%', y: 0, opacity: 1 } : { x: 0, y: '100%', opacity: 1 },
  }

  useEffect(() => {
    const d = dlg.current
    if (!d) return
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null
      d.showModal()
      leaveLayer.current = enterToastLayer(d)
    }
    let current = true
    void sheet.start(open ? 'open' : 'closed').then(() => {
      if (!current || open || !d.open) return
      d.close()
      leaveLayer.current?.()
      leaveLayer.current = null
      if (opener.current?.isConnected && document.activeElement !== opener.current) opener.current.focus()
      onClosed?.()
    })
    return () => {
      current = false // reopened mid-close: keep the dialog
    }
    // onClosed is read when the exit finishes; it does not restart the animation
  }, [open, sheet])

  useEffect(() => () => leaveLayer.current?.(), [])

  const bottom = !side && !reduce
  return (
    <dialog ref={dlg} className="ui-sheet-dialog" aria-labelledby={id} onCancel={(e) => { e.preventDefault(); onClose() }}>
      <motion.div className="ui-scrim" initial={false} animate={{ opacity: open ? 1 : 0 }} transition={spring} onClick={onClose} />
      <motion.div className={`ui-sheet ${side ? 'side' : 'bottom'}`} initial="closed" animate={sheet} variants={variants} transition={spring}
        drag={bottom ? 'y' : false} dragControls={drag} dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.04, bottom: 1 }}
        onDragEnd={(_, info) => (info.offset.y > 96 || info.velocity.y > 500 ? onClose() : void sheet.start('open'))}>
        <div className="ui-sheet-hd" onPointerDown={bottom ? (e) => drag.start(e) : undefined}>
          {!side && <span className="ui-grabber" aria-hidden="true" />}
          <h2 id={id}>{title}</h2>
          <button type="button" className="ui-close" onClick={onClose} aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="ui-sheet-body">{children}</div>
      </motion.div>
    </dialog>
  )
}
