import { Link } from 'react-router'
import { evaluate } from '../domain/risk'
import { Card, Empty, Pill } from '../ui'
import { useToday } from '../don/blocks'
import { deliverableStatus, inUseText } from './model'
import { TerralPage, useTerralCtx } from './Page'

/** Entregas: the deliverables in plan order, each with status, in-use date and the Terral owner of use. */
export function Deliverables() {
  const t = useToday()
  const { base } = useTerralCtx()
  return (
    <TerralPage eyebrow="Projeto" title="Entregas"
      sub={(d) => `${d.deliverables.filter((x) => x.in_use_at).length} de ${d.deliverables.length} em uso.`}>
      {(d) => {
        const health = evaluate(d, t).health
        const list = [...d.deliverables].sort((a, b) => a.sort - b.sort)
        return (
          <Card>
            {list.length ? (
              <ul className="t-list t-dlv" aria-label="Entregas">
                {list.map((x) => {
                  const s = deliverableStatus(x, health[x.code])
                  return (
                    <li key={x.code}>
                      <Link className="t-row-link" to={`${base}/entregas/${encodeURIComponent(x.code)}`}>
                        <span className="t-code">{x.code}</span>
                        <span className="t-li-text">
                          <span className="t">{x.name}</span>
                          <span className="d">
                            <span>Uso: {x.in_use_at ? 'em uso' : inUseText(x)}</span>
                            {x.terral_owner && <span>{x.terral_owner}</span>}
                          </span>
                        </span>
                        <span className="t-li-side">
                          <Pill tone={s.tone}>{s.label}</Pill>
                          {x.in_use_confirmed && !x.in_use_at && <span className="t-confirmed">data confirmada</span>}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : <Empty title="Nenhuma entrega ainda." hint="As entregas aparecem aqui assim que o plano for carregado." />}
          </Card>
        )
      }}
    </TerralPage>
  )
}
