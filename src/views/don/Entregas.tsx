import { useMemo } from 'react'
import { Link } from 'react-router'
import { fmtHours } from '../../domain/dates'
import { evaluate } from '../../domain/risk'
import type { Deliverable } from '../../domain/types'
import { usePlanData } from '../../lib/data'
import { Card, Pill } from '../../ui'
import { useToday } from '../../don/blocks'
import { byCode } from '../../don/mutations'
import { DonPage } from '../../don/Page'
import { HEALTH, nextOf, progressOf } from '../../don/plan'
import '../../don/plan.css'

/** Don: the 19 deliverables by code (3.1 … 3.14, then I1 … I5), health, progress in hours and the next milestone. */
export default function Entregas() {
  const state = usePlanData()
  const t = useToday()
  const health = useMemo(() => (state.data ? evaluate(state.data, t).health : {}), [state.data, t])

  return (
    <DonPage eyebrow="Plano" title="Entregas e tarefas" state={state}
      sub={(d) => {
        const inUse = d.deliverables.filter((x) => x.in_use_at).length
        return `${d.deliverables.length} entregas · ${inUse} em uso. Toque numa entrega para ver tarefas, blocos e dependências.`
      }}>
      {(d) => {
        const group = (origin: Deliverable['origin']) => d.deliverables.filter((x) => x.origin === origin).sort(byCode)
        return [['escopo2', 'Escopo 2'], ['instrumento', 'Instrumentos']].map(([origin, title]) => {
          const list = group(origin as Deliverable['origin'])
          return !!list.length && (
            <Card key={origin} title={`${title} (${list.length})`}>
              <ul className="don-list dlv-list" aria-label={title}>
                {list.map((x) => {
                  const p = progressOf(x.code, d.blocks)
                  const h = HEALTH[health[x.code] ?? 'on_time']
                  return (
                    <li key={x.code}>
                      <Link className="dlv-row" to={`/don/entregas/${encodeURIComponent(x.code)}`}>
                        <span className="don-code">{x.code}</span>
                        <span className="dlv-main">
                          <span className="t">{x.name}</span>
                          <span className="d">{x.front} · {nextOf(x)}{x.built_at && !x.in_use_at ? ' · construída' : ''}</span>
                          <span className="dlv-prog">
                            <progress max={100} value={p.pct} aria-label={`Progresso de ${x.code}: ${fmtHours(p.done)} de ${fmtHours(p.planned)}`} />
                            <span className="num">{fmtHours(p.done).slice(0, -2)} de {fmtHours(p.planned)}</span>
                          </span>
                        </span>
                        <Pill tone={h.tone}>{h.label}</Pill>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )
        })
      }}
    </DonPage>
  )
}
