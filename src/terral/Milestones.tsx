import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { TerralData } from '../domain/terralView'
import { Card, Empty, Pill, Segmented, Timeline, type TimelineItem } from '../ui'
import { useToday } from '../shared/useToday'
import { milestones, monthLong, projectSpan, type Milestone, type MilestoneKind } from './model'
import { Row, Tag, TerralPage, useTerralCtx } from './Page'

/**
 * "A jornada": in-use milestones (dots) and board decisions (diamonds) on the project span, with "hoje".
 * Same-day items merge into one label, so the line stays calm.
 */
export function Journey({ d, today }: { d: TerralData; today: string }) {
  const { start, end } = projectSpan(d)
  const items = useMemo(() => {
    const groups = new Map<string, Milestone[]>()
    for (const m of milestones(d, { rituals: false })) groups.set(`${m.kind}:${m.date}`, [...(groups.get(`${m.kind}:${m.date}`) ?? []), m])
    return [...groups.values()].map((ms): TimelineItem => {
      const m = ms[0]
      const done = ms.every((x) => x.done)
      const tone = done ? 'ok' : m.date < today ? 'bad' : m.kind === 'decision' ? 'mute' : 'don'
      // decisions by code ("D02–D06"): short labels keep the line to a few rows; the list below has the titles
      if (m.kind === 'decision') return { date: m.date, tone, shape: 'diamond', label: codeRange(m.refs) }
      const names = ms.map((x) => d.deliverables.find((y) => y.code === x.refs[0])?.name ?? x.refs[0])
      return { date: m.date, tone, label: names.length > 1 ? `${names.length} entregas em uso` : names[0] }
    })
  }, [d, today])
  return (
    <>
      <div className="t-journey"><Timeline from={start} to={end} today={today} items={items} /></div>
      <p className="t-legend" aria-hidden="true">
        <span><i className="t-key dot" /> entrega em uso</span>
        <span><i className="t-key diamond" /> decisão da diretoria</span>
        <span><i className="t-key ok" /> já aconteceu</span>
      </p>
    </>
  )
}

/** "D02–D06" for consecutive codes, else "D08, D11". */
function codeRange(codes: string[]) {
  const n = codes.map((c) => Number(c.replace(/\D/g, '')))
  const run = codes.length > 2 && n.every((x, i) => i === 0 || x === n[i - 1] + 1)
  return run ? `${codes[0]}–${codes.at(-1)}` : codes.join(', ')
}

type Filter = 'all' | MilestoneKind
const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'use', label: 'Entregas' },
  { value: 'decision', label: 'Decisões' },
  { value: 'ritual', label: 'Ritos' },
] as const

/** Marcos: the journey, then every milestone by month. Upcoming first; the past is one tap away. */
export function Milestones() {
  const t = useToday()
  return (
    <TerralPage eyebrow="Projeto" title="Marcos"
      sub={(d) => {
        const ms = milestones(d)
        const left = ms.filter((m) => m.date >= t && !m.done).length
        return left ? `${left} marcos pela frente, entre entregas, decisões e ritos.` : 'Todos os marcos já passaram.'
      }}>
      {(d) => <Body d={d} today={t} />}
    </TerralPage>
  )
}

function Body({ d, today }: { d: TerralData; today: string }) {
  const { base } = useTerralCtx()
  const [filter, setFilter] = useState<Filter>('all')
  const [past, setPast] = useState(false)
  const all = useMemo(() => milestones(d), [d])
  const kind = all.filter((m) => filter === 'all' || m.kind === filter)
  const before = kind.filter((m) => m.date < today)
  const list = past ? kind : kind.filter((m) => m.date >= today)
  const months = new Map<string, Milestone[]>()
  for (const m of list) months.set(m.date.slice(0, 7), [...(months.get(m.date.slice(0, 7)) ?? []), m])

  return (
    <>
      <Card title="A jornada"><Journey d={d} today={today} /></Card>
      <Card>
        <div className="t-toolbar">
          <Segmented label="Mostrar" options={FILTERS} value={filter} onChange={setFilter} />
          {before.length > 0 && (
            <button type="button" className="dlink" aria-pressed={past} onClick={() => setPast(!past)}>
              {past ? 'Esconder os que já passaram' : `Mostrar os que já passaram (${before.length})`}
            </button>
          )}
        </div>
        {months.size ? [...months].map(([ym, ms]) => (
          <Fragment key={ym}>
            <h2 className="t-month">{monthLong(`${ym}-01`)}</h2>
            <ul className="t-list">
              {ms.map((m) => <Row key={m.key} date={m.date} title={titleOf(m, base)} detail={m.detail} side={sideOf(m, today)} />)}
            </ul>
          </Fragment>
        )) : <Empty title="Nenhum marco aqui." hint={filter === 'all' ? 'Os próximos marcos aparecem quando o plano tiver datas.' : 'Troque o filtro para ver os outros marcos.'} />}
      </Card>
    </>
  )
}

function titleOf(m: Milestone, base: string): ReactNode {
  if (m.kind === 'use') return <Link className="t-link" to={`${base}/entregas/${encodeURIComponent(m.refs[0])}`}>{m.title}</Link>
  if (m.kind === 'decision') return <Link className="t-link" to={`${base}/decisoes`}>{m.title}</Link>
  return m.title
}

export function sideOf(m: Milestone, today: string): ReactNode {
  const late = m.date < today && !m.done
  if (m.kind === 'use') return m.done ? <Pill tone="ok">Em uso</Pill> : late ? <Pill tone="bad">Atrasada</Pill> : m.confirmed ? <Pill tone="ok">data confirmada</Pill> : <Tag>Uso previsto</Tag>
  if (m.kind === 'decision') return m.done ? <Pill tone="ok">Decidida</Pill> : late ? <Pill tone="bad">Atrasada</Pill> : <Tag you>{m.refs.length > 1 ? 'Suas decisões' : 'Sua decisão'}</Tag>
  return <Tag>Rito</Tag>
}
