import type { ReactNode } from 'react'

export type Tone = 'ok' | 'warn' | 'bad' | 'don' | 'mute'

/** Status chip: colored dot + short text. The text carries the meaning; the color only repeats it. */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`ui-pill ${tone}`}>{children}</span>
}
