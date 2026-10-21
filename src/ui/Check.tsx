import { useEffect, useRef, useState } from 'react'

// ponytail: if the parent never echoes the new value, the visual falls back to the prop after this long.
const SETTLE_MS = 1500

/**
 * Round done-check (22px look, 44px hit area) over a native checkbox. The visual flips on pointer-down; the change
 * commits on click (pointer-up, Space). It shows the optimistic value until the `checked` prop follows, and rolls
 * back if it does not. Dragging off the control before release cancels.
 */
export function Check({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  const [pending, setPending] = useState<boolean | null>(null)
  const press = useRef<boolean | null>(null) // value chosen at pointer-down, until the click
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const shown = pending ?? checked

  const hold = (v: boolean | null) => {
    clearTimeout(timer.current)
    setPending(v)
    if (v !== null) timer.current = setTimeout(() => setPending(null), SETTLE_MS)
  }
  const cancel = () => {
    if (press.current === null) return
    press.current = null
    hold(null)
  }

  // The prop moved (accepted, or rolled back by the data layer): it is the truth again.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) return void (first.current = false)
    clearTimeout(timer.current)
    setPending(null)
  }, [checked])
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <label className="ui-check"
      onPointerDown={(e) => {
        if (disabled || e.button > 0) return
        press.current = !shown
        hold(!shown)
      }}
      onPointerLeave={(e) => e.buttons && cancel() /* still pressed: dragged away */}
      onPointerCancel={cancel}>
      <input type="checkbox" aria-label={label} checked={shown} disabled={disabled}
        onChange={() => {
          const next = press.current ?? !shown
          press.current = null
          hold(next)
          onChange(next)
        }} />
      <span className="ui-check-box" aria-hidden="true" />
    </label>
  )
}
