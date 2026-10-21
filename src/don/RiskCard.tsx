import type { ReactNode } from 'react'
import { fmtDate } from '../domain/dates'
import type { Risk, RuleId } from '../domain/risk'
import type { Person } from '../domain/types'
import { Card, Pill, SEVERITY, SeverityBar } from '../ui'
import './don.css'

const SOURCE: Record<RuleId | 'manual', string> = {
  terral_dependency_overdue: 'Automático · dependência',
  decision_late_blocking: 'Automático · decisão',
  day_over_capacity: 'Automático · capacidade',
  week_over_capacity: 'Automático · capacidade',
  hours_unconfirmed: 'Automático · agenda',
  confirmed_not_distributed: 'Automático · agenda',
  deliverable_no_in_use_date: 'Automático · data de uso',
  behind_plan: 'Automático · plano',
  slack_exhausted: 'Automático · capacidade',
  manual: 'Manual',
}

/** Risks as rows: severity bar, source, title, held-up deliverables as chips, date and person. `limit` keeps the first n. */
export function RiskCard({ risks, limit, people = [], title = 'Riscos e gargalos', action, className, rowAction, empty = 'Nenhum risco aberto.' }: {
  risks: Risk[]; limit?: number; people?: Person[]; title?: ReactNode; action?: ReactNode; className?: string
  /** Control under the severity Pill of a row (Riscos: "Encerrar" on manual risks). */
  rowAction?: (r: Risk) => ReactNode; empty?: string
}) {
  const shown = limit === undefined ? risks : risks.slice(0, limit)
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id
  return (
    <Card title={title} action={action} className={className}>
      {shown.length ? (
        <ul className="don-list">
          {shown.map((r) => {
            const meta = [r.date && fmtDate(r.date), r.person_id && nameOf(r.person_id)].filter(Boolean).join(' · ')
            return (
              <li key={r.id} className="don-risk">
                <SeverityBar severity={r.severity} />
                <div className="don-risk-text">
                  <div className="overline">{SOURCE[r.rule]}</div>
                  <div className="t">{r.title}</div>
                  {meta && <div className="d">{meta}</div>}
                  {!!r.codes.length && (
                    <div className="don-chips" aria-label="Entregas afetadas">
                      {r.codes.map((c) => <span key={c} className="don-chip">{c}</span>)}
                    </div>
                  )}
                </div>
                <div className="don-risk-act">
                  <Pill tone={SEVERITY[r.severity].tone}>{SEVERITY[r.severity].label}</Pill>
                  {rowAction?.(r)}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="don-quiet">{empty}</p>
      )}
    </Card>
  )
}
