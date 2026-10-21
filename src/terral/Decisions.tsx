import { fmtDate } from '../domain/dates'
import type { Decision } from '../domain/types'
import { Card, Empty, Pill, Sheet } from '../ui'
import { useToday } from '../don/blocks'
import { useEditor } from '../don/fields'
import { DecisionForm } from './actions'
import { byCode } from './model'
import { PREVIEW_HINT, TerralPage, useTerralCtx } from './Page'

/** Decisões: D01–D15 with date, state and outcome. A pending one can be registered once; then only Don changes it. */
export function Decisions() {
  const t = useToday()
  const { preview } = useTerralCtx()
  const editor = useEditor<Decision>()
  return (
    <TerralPage eyebrow="Diretoria" title="Decisões"
      sub={(d) => {
        const n = d.decisions.filter((x) => x.status === 'decided').length
        return `${n} de ${d.decisions.length} ${n === 1 ? 'tomada' : 'tomadas'}.${preview ? ' Na prévia, registrar fica desligado.' : ''}`
      }}>
      {(d) => (
        <>
          <Card>
            {d.decisions.length ? (
              <ul className="t-list" aria-label="Decisões">
                {[...d.decisions].sort(byCode).map((x) => {
                  const late = x.status === 'pending' && !!x.date && x.date < t
                  return (
                    <li key={x.code} className="t-dec">
                      <span className="t-code">{x.code}</span>
                      <div className="t-li-text">
                        <div className="t">{x.title}</div>
                        <div className="d">{x.date ? `Reunião de ${fmtDate(x.date, true)}` : 'Data a definir'}</div>
                        {x.status === 'decided' && (
                          <div className="t-outcome">
                            <p>{x.outcome}</p>
                            {x.decided_by && <span>Decidido por {x.decided_by}</span>}
                          </div>
                        )}
                      </div>
                      <div className="t-li-side">
                        {x.status === 'decided' ? <Pill tone="ok">Decidida em {x.decided_at ? fmtDate(x.decided_at) : '—'}</Pill> : (
                          <>
                            <Pill tone={late ? 'bad' : 'mute'}>{late ? 'Atrasada' : 'Pendente'}</Pill>
                            <button type="button" className="dbtn small" disabled={preview} title={preview ? PREVIEW_HINT : undefined}
                              aria-label={`Registrar decisão ${x.code}`} onClick={() => editor.show(x)}>Registrar decisão</button>
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : <Empty title="Nenhuma decisão no plano." hint="As decisões da diretoria aparecem aqui." />}
          </Card>
          <Sheet {...editor.sheet('Registrar decisão')}>
            {editor.item && <DecisionForm key={editor.item.code} decision={editor.item} today={t} onDone={editor.close} />}
          </Sheet>
        </>
      )}
    </TerralPage>
  )
}
