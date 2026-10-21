import type { ReactNode } from 'react'
import { Card, Empty } from '../ui'
import type { DonData } from '../lib/data'
import './don.css'

/** Page frame for a Don view: eyebrow, h1, sub; loading and load-error states; then the body once data is here. */
export function DonPage({ eyebrow, title, sub, state, children }: {
  eyebrow?: string; title: string; sub?: (d: DonData) => string | undefined
  state: { data?: DonData; status: 'pending' | 'error' | 'success' }
  children: (d: DonData) => ReactNode
}) {
  const { data, status } = state
  return (
    <div className="don-page">
      <header className="don-head">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p className="sub">{data ? sub?.(data) : status === 'pending' ? 'Carregando…' : ''}</p>
      </header>
      {data ? children(data) : status === 'pending' ? null : (
        <Card><Empty title="Não deu para carregar os dados." hint="Confira a internet e recarregue a página." /></Card>
      )}
    </div>
  )
}
