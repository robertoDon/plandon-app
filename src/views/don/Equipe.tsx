import { useMemo, useState } from 'react'
import { today as todayOf } from '../../domain/dates'
import { evaluate, type Risk } from '../../domain/risk'
import type { Person } from '../../domain/types'
import { usePlanData, useMutate } from '../../lib/data'
import { Card, LoadBar, Pill, SEVERITY } from '../../ui'
import { NumberEdit } from '../../don/fields'
import { patchRows } from '../../don/mutations'
import { DonPage } from '../../don/Page'
import { fmtHours1, teamRow } from '../../don/team'

type Write = { update: Partial<Pick<Person, 'net_capacity_h' | 'daily_cap_h' | 'weekly_cap_h'>>; match: { id: string } }

const LIMIT = { net: 2000, day: 24, week: 168 }
const OVER = new Set(['day_over_capacity', 'week_over_capacity'])
const SHOWN = 6

/** Don: per person, net capacity, planned, done, "a agendar" and slack; editable capacity and caps; days and weeks over the cap. */
export default function Equipe() {
  const state = usePlanData()
  const t = todayOf()
  const risks = useMemo(() => (state.data ? evaluate(state.data, t).risks : []), [state.data, t])
  const write = useMutate<Write>('person', { optimistic: (old, w) => patchRows(old, 'people', (r) => r.id === w.match.id, w.update) })
  const edit = (id: string, update: Write['update']) => void write.mutateAsync({ update, match: { id } }).catch(() => {})

  return (
    <DonPage eyebrow="Plano" title="Equipe e carga" state={state}
      sub={() => 'Folga é a capacidade líquida menos o reservado, o planejado e as horas a agendar.'}>
      {(d) => (
        <div className="dteam">
          {[...d.people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((p) => {
            const r = teamRow(p, d.blocks, d.to_schedule_plan)
            return (
              <Card key={p.id} title={p.name}>
                {p.net_capacity_h !== null && (
                  <LoadBar used={p.reserved_h + r.planned + r.toSchedule} cap={p.net_capacity_h} />
                )}
                <div className="dstats">
                  <Stat label="Planejado" value={fmtHours1(r.planned)} />
                  <Stat label="Feito" value={fmtHours1(r.done)} />
                  <Stat label="A agendar" value={fmtHours1(r.toSchedule)} />
                  <Stat label="Reservado" value={fmtHours1(p.reserved_h)} />
                  <Stat label="Folga" slack={r.slack} />
                </div>
                <div className="dcaps">
                  <NumberEdit label="Capacidade líquida" value={p.net_capacity_h} max={LIMIT.net} allowEmpty onCommit={(n) => edit(p.id, { net_capacity_h: n })} />
                  <NumberEdit label="Limite por dia" value={p.daily_cap_h} max={LIMIT.day} onCommit={(n) => edit(p.id, { daily_cap_h: n! })} />
                  <NumberEdit label="Limite por semana" value={p.weekly_cap_h} max={LIMIT.week} onCommit={(n) => edit(p.id, { weekly_cap_h: n! })} />
                </div>
                <Over risks={risks.filter((x) => x.person_id === p.id && OVER.has(x.rule))} />
              </Card>
            )
          })}
        </div>
      )}
    </DonPage>
  )
}

function Stat({ label, value, slack }: { label: string; value?: string; slack?: number | null }) {
  if (slack === undefined) return <div className="dstat"><span className="overline">{label}</span><b>{value}</b></div>
  return (
    <div className={slack !== null && slack < 0 ? 'dstat slack bad' : 'dstat slack'}>
      <span className="overline">{label}</span>
      <b className={slack !== null && slack < 0 ? 'bad' : undefined}>{slack === null ? '—' : fmtHours1(slack)}</b>
      {slack === null && <span className="caption">sem capacidade líquida</span>}
      {slack !== null && slack < 0 && <span className="caption">acima da capacidade</span>}
    </div>
  )
}

/** Days and weeks above the cap, from the engine (today on). Long lists fold. */
function Over({ risks }: { risks: Risk[] }) {
  const [all, setAll] = useState(false)
  const list = all ? risks : risks.slice(0, SHOWN)
  return (
    <>
      <h3 className="don-subhd" style={{ fontSize: 15, letterSpacing: 0 }}>Acima do limite</h3>
      {risks.length ? (
        <>
          <ul className="don-list">
            {list.map((x) => (
              <li key={x.id} className="don-pend" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                <span>{x.title}</span>
                <Pill tone={SEVERITY[x.severity].tone}>{SEVERITY[x.severity].label}</Pill>
              </li>
            ))}
          </ul>
          {risks.length > SHOWN && (
            <button type="button" className="dlink" onClick={() => setAll(!all)} aria-expanded={all}>
              {all ? 'Mostrar menos' : `Mostrar todos (${risks.length})`}
            </button>
          )}
        </>
      ) : <p className="don-quiet">Nenhum dia ou semana acima do limite.</p>}
    </>
  )
}
