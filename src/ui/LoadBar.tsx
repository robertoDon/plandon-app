import { motion } from 'motion/react'
import { fmtHours } from '../domain/dates'
import { spring } from '../lib/motion'

const n = (h: number) => fmtHours(h).slice(0, -2) // "3,5"

/**
 * Hours used against a cap: "33 / 40 h". Over the cap the bar rescales to `used`, the excess is red, a notch marks
 * the cap and the text says "acima do limite" (meaning never rides on color alone). `label` adds the name column.
 */
export function LoadBar({ used, cap, label }: { used: number; cap: number; label?: string }) {
  const over = used > cap
  const scale = Math.max(used, cap, 0.0001)
  const pct = (h: number) => `${(Math.max(0, h) / scale) * 100}%`
  const name = `${label ? `${label}: ` : ''}${fmtHours(used)} de ${fmtHours(cap)}${over ? ', acima do limite' : ''}`
  return (
    <div className={label ? 'ui-load' : 'ui-load bare'} data-over={over || undefined}>
      {label && <span className="ui-load-name" aria-hidden="true">{label}</span>}
      <div className="ui-load-bar" role="img" aria-label={name}>
        <motion.i className="used" initial={false} animate={{ width: pct(Math.min(used, cap)) }} transition={spring} />
        {over && <motion.i className="over" initial={{ width: 0 }} animate={{ width: pct(used - cap) }} transition={spring} />}
        {over && <span className="ui-load-cap" style={{ left: pct(cap) }} />}
      </div>
      <span className="ui-load-n" aria-hidden="true">{n(used)} / {fmtHours(cap)}</span>
    </div>
  )
}
