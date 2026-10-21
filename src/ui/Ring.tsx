import { motion, useReducedMotion } from 'motion/react'
import { spring } from '../lib/motion'

/** Progress ring (108px in the mockup): "value/total" over the label. Named "3 de 19 entregas". */
export function Ring({ value, total, label, size = 108 }: { value: number; total: number; label: string; size?: number }) {
  const reduce = useReducedMotion()
  const p = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0
  const stroke = size * 0.0926 // 10 at 108
  const r = size * 0.426 // 46 at 108, as the mockup
  const c = size / 2
  return (
    <div className="ui-ring" role="img" aria-label={`${value} de ${total} ${label}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(0,0,0,.06)" strokeWidth={stroke} />
        <motion.circle cx={c} cy={c} r={r} fill="none" stroke="var(--don)" strokeWidth={stroke} strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: p, opacity: p > 0 ? 1 : 0 }} // round caps would draw a dot at 0
          transition={reduce ? { duration: 0 } : { ...spring, duration: 0.6 }} />
      </svg>
      <b aria-hidden="true"><span>{value}/{total}</span>{label}</b>
    </div>
  )
}
