import { useId, useRef, type KeyboardEvent } from 'react'
import { motion } from 'motion/react'
import { spring } from '../lib/motion'

export interface SegmentedOption<T extends string> { value: T; label: string }

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/**
 * iOS-style segmented control as a radio group: one tab stop, arrows/Home/End move and select (wrapping),
 * the white knob slides between segments with the house spring.
 */
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: readonly SegmentedOption<T>[]; value: T; onChange: (v: T) => void; label: string
}) {
  const knob = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const at = options.findIndex((o) => o.value === value)

  const onKey = (e: KeyboardEvent) => {
    const n = options.length
    const i = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : e.key in STEP ? (Math.max(at, 0) + STEP[e.key] + n) % n : -1
    if (i < 0) return
    e.preventDefault()
    onChange(options[i].value)
    refs.current[i]?.focus()
  }

  return (
    <div className="ui-seg" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button key={o.value} ref={(el) => void (refs.current[i] = el)} type="button" role="radio" aria-checked={on}
            tabIndex={on || (at < 0 && i === 0) ? 0 : -1} onClick={() => !on && onChange(o.value)}>
            {on && <motion.span layoutId={knob} className="ui-seg-knob" transition={spring} />}
            <span className="ui-seg-label">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
