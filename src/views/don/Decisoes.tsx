import { fmtDate, fmtHours, today as todayOf } from '../../domain/dates'
import type { Decision } from '../../domain/types'
import { usePlanData } from '../../lib/data'
import { Card, Empty, Pill, Sheet } from '../../ui'
import { sumHours } from '../../don/blocks'
import { DecisionForm } from '../../don/DecisionForm'
import { useEditor } from '../../don/fields'
import { byCode } from '../../don/mutations'
import { DonPage } from '../../don/Page'

/** Don: the board decisions D01–D15 with date, status, outcome, preparation date and prep hours (blocks coded to the decision). */
export default function Decisoes() {
  const state = usePlanData()
  const t = todayOf()
  const editor = useEditor<Decision>()

  return (
    <DonPage eyebrow="Plano" title="Decisões" state={state}
      sub={(d) => `${d.decisions.filter((x) => x.status === 'decided').length} de ${d.decisions.length} decididas.`}>
      {(d) => {
        const prep = (code: string) => {
          const h = sumHours(d.blocks.filter((b) => b.code === code))
          return h ? fmtHours(h) : null
        }
        return (
          <>
            <Card>
              {d.decisions.length ? (
                <ul className="don-list" aria-label="Decisões">
                  {[...d.decisions].sort(byCode).map((x) => {
                    const h = prep(x.code)
                    return (
                      <li key={x.code} className="dgrid-item solo">
                        <button type="button" className="drow-btn" onClick={() => editor.show(x)} aria-label={`Editar ${x.code}: ${x.title}`}>
                          <span className="don-code">{x.code}</span>
                          <span className="drow">
                            <span className="t">{x.title}</span>
                            <span className="drow-meta">
                              {x.date && <span>reunião {fmtDate(x.date)}</span>}
                              {x.prepared_on && <span>preparar até {fmtDate(x.prepared_on)}</span>}
                              {h && <span className="num">preparação {h}</span>}
                            </span>
                            {x.status === 'decided' && x.outcome && <span className="d" style={{ display: 'block' }}>{x.outcome}</span>}
                          </span>
                          <span className="drow-side">
                            {x.status === 'decided' ? <Pill tone="ok">Decidida{x.decided_at ? ` ${fmtDate(x.decided_at)}` : ''}</Pill>
                              : x.date && x.date < t ? <Pill tone="bad">Atrasada</Pill> : <Pill tone="mute">Pendente</Pill>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : <Empty title="Nenhuma decisão." />}
            </Card>
            <Sheet {...editor.sheet(editor.item?.code ?? '')}>
              {editor.item && <DecisionForm key={editor.item.code} decision={editor.item} prepHours={prep(editor.item.code)} onDone={editor.close} />}
            </Sheet>
          </>
        )
      }}
    </DonPage>
  )
}
