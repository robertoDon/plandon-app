import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useSession } from '../../auth/useSession'
import { addDays, fmtDate, fmtHours } from '../../domain/dates'
import { dayCap, evaluate } from '../../domain/risk'
import type { Block, Person } from '../../domain/types'
import { usePlanData } from '../../lib/data'
import { Card, Empty, LoadBar, Pill } from '../../ui'
import { BlockRow, byOrder, longDay, sumHours, useToday, useToggleBlock, usePerson, weekday, weekOf, windowText } from '../../don/blocks'
import { RiskCard } from '../../don/RiskCard'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Don home: the signed-in person's day, the top risks, the week's load and the open items about to fall due. */
export default function Hoje() {
  const { data, status } = usePlanData()
  const { profile } = useSession()
  const t = useToday()
  const week = weekOf(t)
  const [sel, setSel] = useState(t)
  useEffect(() => setSel(t), [t]) // past midnight: the new today
  const { person, picker } = usePerson(data?.people ?? [])
  const toggle = useToggleBlock()
  const risks = useMemo(() => (data ? evaluate(data, t).risks : []), [data, t])
  const first = profile?.display_name.trim().split(/\s+/)[0] ?? ''

  const head = (sub?: string) => (
    <header className="don-head">
      <div className="eyebrow">{longDay(t)}{data && weekCode(data.blocks, week)}</div>
      <h1>{first ? `Seu dia, ${first}.` : 'Seu dia.'}</h1>
      {sub && <p className="sub">{sub}</p>}
      {picker}
    </header>
  )
  if (status === 'pending') return <div className="don-page">{head('Carregando…')}</div>
  if (!data) return <div className="don-page">{head()}<Card><Empty title="Não deu para carregar os dados." hint="Confira a internet e recarregue a página." /></Card></div>

  const mine = data.blocks.filter((b) => b.person_id === person?.id)
  const onDay = (d: string) => mine.filter((b) => b.date === d)
  const mineToday = onDay(t)
  const teamToday = sumHours(data.blocks.filter((b) => b.date === t && b.person_id))
  const sub = [
    mineToday.length && `${fmtHours(sumHours(mineToday))} em ${plural(mineToday.length, 'atividade', 'atividades')}.`,
    teamToday && `A equipe tem ${fmtHours(teamToday)} hoje.`,
  ].filter(Boolean).join(' ')
  const day = onDay(sel).sort(byOrder)
  const dayH = sumHours(day)
  const dayLimit = person && day.length ? dayCap(person, day) : Infinity
  const names = new Map(data.deliverables.map((d) => [d.code, d.name]))
  const inWeek = data.blocks.filter((b) => b.person_id && b.date >= week[0] && b.date <= week[6])

  const soon = addDays(t, 7)
  const due = data.open_items
    .filter((o) => o.kind === 'pendencia' && o.status === 'open' && o.due && o.due <= soon)
    .sort((a, b) => a.due!.localeCompare(b.due!) || a.code.localeCompare(b.code, 'pt-BR', { numeric: true }))

  return (
    <div className="don-page">
      {head(sub)}
      <div className="don-grid">
        <Card className="don-day">
          <WeekStrip week={week} today={t} selected={sel} onSelect={setSel} blocks={mine} person={person} />
          {dayH > dayLimit && <p className="don-over"><Pill tone="bad">{fmtHours(dayH)}, acima do limite de {fmtHours(dayLimit)}</Pill></p>}
          {day.length ? (
            <ul className="don-list don-blocks" aria-label={sel === t ? 'Hoje' : longDay(sel)}>
              {day.map((b) => <BlockRow key={b.id} block={b} names={names} onToggle={toggle} />)}
            </ul>
          ) : (
            <p className="don-quiet don-free">{windowText(sel, sel, data.blocks) ?? (sel === t ? 'Nada agendado para hoje.' : 'Nada agendado para este dia.')}</p>
          )}
          {!!inWeek.length && (
            <>
              <h2 className="don-subhd">Carga da semana</h2>
              <div className="don-load">
                {[...data.people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((p) => (
                  <LoadBar key={p.id} label={p.name} used={sumHours(inWeek.filter((b) => b.person_id === p.id))} cap={p.weekly_cap_h} />
                ))}
              </div>
            </>
          )}
        </Card>

        <RiskCard className="don-risks" risks={risks} limit={3} people={data.people}
          action={risks.length > 3 && <Link to="/don/riscos">Todos ({risks.length})</Link>} />
      </div>

      <Card title="Pendências que vencem" action={<Link to="/don/pendencias">Todas</Link>}>
        {due.length ? (
          <ul className="don-list">
            {due.map((o) => (
              <li key={o.code} className="don-pend">
                <span className="don-code">{o.code}</span>
                <span>{o.text} · <span className="don-owner">{o.owner_public}</span></span>
                {o.due! < t ? <Pill tone="bad">venceu {fmtDate(o.due!)}</Pill>
                  : o.due === t ? <Pill tone="warn">hoje</Pill>
                  : <span className="don-when num">{fmtDate(o.due!)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="don-quiet">Nada vence nos próximos 7 dias.</p>
        )}
      </Card>
    </div>
  )
}

const weekCode = (blocks: Block[], week: string[]) => {
  const w = blocks.find((b) => b.date >= week[0] && b.date <= week[6])?.week
  return w ? ` · ${w}` : ''
}

/** Mon–Sun. A dot marks a day with blocks; red when the person's hours pass that day's cap. Tap selects. */
function WeekStrip({ week, today, selected, onSelect, blocks, person }: {
  week: string[]; today: string; selected: string; onSelect: (d: string) => void; blocks: Block[]; person: Person | null
}) {
  return (
    <div className="don-week" role="group" aria-label="Semana">
      {week.map((d) => {
        const bs = blocks.filter((b) => b.date === d)
        const h = sumHours(bs)
        const over = !!person && bs.length > 0 && h > dayCap(person, bs)
        const name = [weekday(d), fmtDate(d), d === today && 'hoje', bs.length && fmtHours(h), over && 'acima do limite'].filter(Boolean).join(', ')
        return (
          <button key={d} type="button" aria-pressed={d === selected} aria-label={name} onClick={() => onSelect(d)}
            className={d === today ? 'is-today' : undefined}>
            <span>{weekday(d).slice(0, 3).toUpperCase()}</span>
            <b className="num">{+d.slice(8)}</b>
            <i className={over ? 'bad' : bs.length ? 'on' : undefined} aria-hidden="true">{over && '!'}</i>
          </button>
        )
      })}
    </div>
  )
}
