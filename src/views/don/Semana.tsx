import { fmtDate, fmtHours } from '../../domain/dates'
import { dayCap } from '../../domain/risk'
import { usePlanData } from '../../lib/data'
import { Card, Empty, LoadBar, Pill } from '../../ui'
import { BlockRow, byOrder, cap, sumHours, useToday, useToggleBlock, usePerson, weekday, weekOf, windowText } from '../../don/blocks'

/** The person's blocks Mon–Sun of this week, day by day. Past blocks still open say so. */
export default function Semana() {
  const { data, status } = usePlanData()
  const t = useToday()
  const week = weekOf(t)
  const { person, picker } = usePerson(data?.people ?? [])
  const toggle = useToggleBlock()

  const blocks = (data?.blocks ?? []).filter((b) => b.person_id === person?.id && b.date >= week[0] && b.date <= week[6]).sort(byOrder)
  const total = sumHours(blocks)
  const done = blocks.filter((b) => b.done).length
  const code = blocks[0]?.week ?? data?.blocks.find((b) => b.date >= week[0] && b.date <= week[6])?.week

  const head = (sub?: string) => (
    <header className="don-head">
      <div className="eyebrow">{code && `${code} · `}{fmtDate(week[0])} a {fmtDate(week[6])}</div>
      <h1>{picker && person ? `Semana de ${person.name}` : 'Minha semana'}</h1>
      {sub && <p className="sub">{sub}</p>}
      {picker}
    </header>
  )
  if (status === 'pending') return <div className="don-page">{head('Carregando…')}</div>
  if (!data) return <div className="don-page">{head()}<Card><Empty title="Não deu para carregar os dados." hint="Confira a internet e recarregue a página." /></Card></div>
  if (!blocks.length)
    return <div className="don-page">{head()}<Card><Empty title={windowText(week[0], week[6], data.blocks) ?? 'Nada agendado nesta semana.'} /></Card></div>

  const names = new Map(data.deliverables.map((d) => [d.code, d.name]))
  const days = week.map((d) => ({ d, bs: blocks.filter((b) => b.date === d) })).filter((x) => x.bs.length)

  return (
    <div className="don-page">
      {head(`${fmtHours(total)} em ${blocks.length} ${blocks.length === 1 ? 'atividade' : 'atividades'}; ${done} ${done === 1 ? 'feita' : 'feitas'}.`)}
      {person && <Card><LoadBar used={total} cap={person.weekly_cap_h} /></Card>}
      {days.map(({ d, bs }) => {
        const h = sumHours(bs)
        const over = !!person && h > dayCap(person, bs)
        return (
          <Card key={d} title={d === t ? `Hoje, ${fmtDate(d)}` : `${cap(weekday(d))}, ${fmtDate(d)}`}
            action={over ? <Pill tone="bad">{fmtHours(h)}, acima do limite</Pill> : <span className="don-when num">{fmtHours(h)}</span>}>
            <ul className="don-list don-blocks">
              {bs.map((b) => (
                <BlockRow key={b.id} block={b} names={names} onToggle={toggle}>
                  {b.date < t && !b.done && <Pill tone="warn">ficou para trás</Pill>}
                </BlockRow>
              ))}
            </ul>
          </Card>
        )
      })}
    </div>
  )
}
