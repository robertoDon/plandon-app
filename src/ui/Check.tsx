import { useEffect, useRef, useState } from 'react'

// ponytail: with no echo of the new value and no `pending` flag, the visual falls back to the prop this long after
// the commit. Optimistic callers never hit it.
const SETTLE_MS = 1500

/**
 * Round done-check (22px look, 44px hit area) over a native checkbox. The visual flips on pointer-down and holds
 * while pressed; the change commits on click (pointer-up, Space). Dragging off, or releasing outside, cancels.
 *
 * After the commit it shows the new value until the `checked` prop moves. The write behind `onChange` must update
 * `checked` optimistically (useMutate's `optimistic`); its error rollback then shows here. If the prop does not move
 * within 1.5 s the visual rolls back, unless the caller passes `pending` (a save in flight): then it waits until
 * `pending` turns false and shows the prop.
 */
export function Check({ checked, onChange, label, disabled, pending: saving = false }: {
  checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; pending?: boolean
}) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const press = useRef<boolean | null>(null) // value chosen at pointer-down, until the click
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const savingRef = useRef(saving)
  savingRef.current = saving
  const shown = optimistic ?? checked

  const reset = () => {
    clearTimeout(timer.current)
    setOptimistic(null)
  }
  const cancel = () => {
    if (press.current === null) return
    press.current = null
    reset()
  }

  // The prop moved (accepted, or rolled back by the data layer), or the save finished: the prop is the truth again.
  const seen = useRef({ checked, saving })
  useEffect(() => {
    const was = seen.current
    seen.current = { checked, saving }
    if (was.checked !== checked || (was.saving && !saving)) reset()
  }, [checked, saving])
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <label className="ui-check"
      onPointerDown={(e) => {
        if (disabled || e.button > 0) return
        clearTimeout(timer.current) // no rollback while pressed
        press.current = !shown
        setOptimistic(!shown)
      }}
      onPointerUp={(e) => {
        // A touch released outside lands here (implicit capture) but gets no click.
        const r = e.currentTarget.getBoundingClientRect()
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cancel()
      }}
      onPointerLeave={(e) => e.buttons && cancel() /* still pressed: dragged away */}
      onPointerCancel={cancel}>
      <input type="checkbox" aria-label={label} checked={shown} disabled={disabled}
        onChange={() => {
          const next = press.current ?? !shown
          press.current = null
          setOptimistic(next)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => !savingRef.current && setOptimistic(null), SETTLE_MS)
          onChange(next)
        }} />
      <span className="ui-check-box" aria-hidden="true" />
    </label>
  )
}
