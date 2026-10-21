import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useSession } from '../auth/useSession'
import { diffDays, fmtDate } from '../domain/dates'
import { evaluate } from '../domain/risk'
import type { TerralData } from '../domain/terralView'
import { Card, Empty, Pill, Ring, Segmented } from '../ui'
import { useToday } from '../don/blocks'
import { useConfirmDate } from './actions'
import { Journey } from './Milestones'
import { dueTone, greeting, HEALTH, milestones, projectSpan, spHour, terralTodos, weekNo, type TerralTodo } from './model'
import { PREVIEW_HINT, Row, Tag, TerralPage, useTerralCtx } from './Page'

const TODOS_SHOWN = 6

/** Terral home: greeting, health card, the journey, the next milestones and what depends on Terral. */
export function Overview() {
  const { profile } = useSession()
  const { preview } = useTerralCtx()
  const t = useToday()
  // The preview never shows the Don user's own name: this is Terral's screen.
  const first = preview ? '' : (profile?.display_name.trim().split(/\s+/)[0] ?? '')
  const hello = greeting(spHour())
  return (
    <TerralPage title={first ? `${hello}, ${first}.` : `${hello}.`}
      eyebrow={(d) => {
        if (!d) return 'Execução da estrutura comercial'
        const { start, weeks } = projectSpan(d)
        return `Execução da estrutura comercial · semana ${weekNo(t, start, weeks)} de ${weeks}`
      }}
      sub={(d) => subline(d, t)}>
      {(d) => <Body d={d} today={t} />}
    </TerralPage>
  )
}

const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

function subline(d: TerralData, today: string) {
  const { start, end } = projectSpan(d)
  const close = `Termina em ${fmtDate(end, true)}.`
  if (today < start) {
    const n = diffDays(start, today)
    const day = new Date(`${start}T12:00:00Z`).getUTCDay()
    return `O projeto começa ${n === 1 ? 'amanhã' : `${day === 0 || day === 6 ? 'no' : 'na'} ${WEEKDAY[day]}`}, ${fmtDate(start)}. ${close}`
  }
  if (today > end) return `O projeto terminou em ${fmtDate(end, true)}.`
  const left = Math.ceil((diffDays(end, today) + 1) / 7)
  return left <= 1 ? `Última semana. ${close}` : `Faltam ${left} semanas. ${close}`
}

function Body({ d, today }: { d: TerralData; today: string }) {
  const { base, preview } = useTerralCtx()
  const confirm = useConfirmDate()
  const [all, setAll] = useState(false)
  const [tab, setTab] = useState<'open_item' | 'to_schedule'>('open_item')
  const result = useMemo(() => evaluate(d, today), [d, today])
  const inUse = d.deliverables.filter((x) => x.in_use_at).length
  const decided = d.decisions.filter((x) => x.status === 'decided').length
  const openItems = d.open_items.filter((o) => o.kind === 'pendencia' && o.status === 'open').length
  const ms = useMemo(() => milestones(d), [d])
  const next = ms.filter((m) => m.date >= today && !m.done)
  const nextKey = next.find((m) => m.kind !== 'ritual')
  const every = useMemo(() => terralTodos(d), [d])
  const count = (k: TerralTodo['kind']) => every.filter((x) => x.kind === k && !(x.kind === 'to_schedule' && x.item.confirmed_date)).length
  const todos = every.filter((x) => x.kind === tab)
  const shown = all ? todos : todos.slice(0, TODOS_SHOWN)
  const h = HEALTH[result.project.status]

  return (
    <>
      <Card className="t-health">
        <Ring value={inUse} total={d.deliverables.length} label="entregas" />
        <div className="t-health-head">
          <Pill tone={h.tone}>{h.label}</Pill>
          <h3>{h.head}</h3>
        </div>
        {result.project.reasons.length ? (
          <ul className="t-reasons" aria-label="Por quê">
            {result.project.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        ) : <p className="t-reasons t-reasons-none">Nenhum ponto pede atenção agora.</p>}
        <dl className="t-kpis">
          <div><dt>entregas em uso</dt><dd className="num">{inUse}</dd></div>
          <div><dt>próximo marco</dt><dd className="num" title={nextKey?.title}>{nextKey ? fmtDate(nextKey.date) : '—'}</dd></div>
          <div><dt>decisões tomadas</dt><dd className="num">{decided}/{d.decisions.length}</dd></div>
          <div><dt>pendências da Terral</dt><dd className="num">{openItems}</dd></div>
        </dl>
      </Card>

      <Card title="A jornada" action={<Link to={`${base}/entregas`}>Ver todas as entregas</Link>}>
        <Journey d={d} today={today} />
      </Card>

      <div className="t-two">
        <Card title="Próximos marcos" action={<Link to={`${base}/marcos`}>Todos os marcos</Link>}>
          {next.length ? (
            <ul className="t-list" aria-label="Próximos marcos">
              {next.slice(0, 5).map((m) => (
                <Row key={m.key} date={m.date} title={m.title} detail={m.detail}
                  side={m.kind === 'decision' ? <Tag you>{m.refs.length > 1 ? 'Suas decisões' : 'Sua decisão'}</Tag>
                    : m.kind === 'use' ? (m.confirmed ? <Pill tone="ok">data confirmada</Pill> : <Tag>Uso previsto</Tag>)
                    : <Tag>Rito</Tag>} />
              ))}
            </ul>
          ) : <Empty title="Nenhum marco pela frente." hint="Todos os marcos do plano já passaram." />}
        </Card>

        <Card title="O que depende da Terral">
          <Segmented label="Mostrar" value={tab} onChange={(v) => { setTab(v); setAll(false) }}
            options={[{ value: 'open_item', label: `Pendências (${count('open_item')})` }, { value: 'to_schedule', label: `Datas a confirmar (${count('to_schedule')})` }]} />
          {todos.length ? (
            <>
              <ul className="t-list t-todos" aria-label={tab === 'open_item' ? 'Pendências da Terral' : 'Datas a confirmar'}>
                {shown.map((x) => <TodoRow key={x.key} x={x} today={today} preview={preview} onConfirm={confirm.ask} />)}
              </ul>
              {todos.length > TODOS_SHOWN && (
                <button type="button" className="dlink t-more" aria-expanded={all} onClick={() => setAll(!all)}>
                  {all ? 'Mostrar menos' : `Mostrar todas (${todos.length})`}
                </button>
              )}
            </>
          ) : <Empty title={tab === 'open_item' ? 'Nenhuma pendência aberta.' : 'Nenhuma data a confirmar.'} hint="Quando algo depender de vocês, aparece aqui." />}
        </Card>
      </div>
      {confirm.sheet}
    </>
  )
}

function TodoRow({ x, today, preview, onConfirm }: { x: TerralTodo; today: string; preview: boolean; onConfirm: ReturnType<typeof useConfirmDate>['ask'] }) {
  if (x.kind === 'open_item') {
    const o = x.item
    const due = dueTone(o.due, today)
    return (
      <Row date={o.due} clamp title={o.text}
        detail={[o.effect && `Se não resolver: ${o.effect}`, !o.due && o.due_text].filter(Boolean).join(' · ') || o.owner_public}
        side={due ? <Pill tone={due.tone}>{due.label}</Pill> : <Tag>{o.code}</Tag>} />
    )
  }
  const s = x.item
  const name = x.deliverable ? `${s.code} ${x.deliverable.name}` : s.code
  return (
    <Row date={x.date} clamp title={s.what}
      detail={s.confirmed_date ? `Entrega ${name}` : `Entrega ${name} · ${s.window_text ?? 'janela a definir'}`}
      side={s.confirmed_date ? <Pill tone="ok">data confirmada</Pill> : (
        <button type="button" className="dbtn small" disabled={preview} title={preview ? PREVIEW_HINT : undefined}
          aria-label={`Confirmar data: ${s.what}`}
          onClick={() => onConfirm({
            kind: 'to_schedule', ref: s.id, title: s.what, initial: s.window_start && s.window_start >= today ? s.window_start : null,
            hint: s.window_text ? `Janela combinada: ${s.window_text}.` : undefined,
          })}>Confirmar data</button>
      )} />
  )
}
