import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useSession } from '../auth/useSession'
import { diffDays, fmtDate } from '../domain/dates'
import type { TerralData } from '../domain/terralView'
import { Card, Empty, Pill, Ring, Segmented } from '../ui'
import { useToday } from '../shared/useToday'
import { useConfirmDate } from './actions'
import { Journey } from './Milestones'
import { dueTone, greeting, healthOf, milestones, projectSpan, spHour, terralTodos, weekNo, type HealthSummary, type TerralTodo } from './model'
import { PREVIEW_HINT, Row, Tag, TerralPage, useTerralCtx } from './Page'

const TODOS_SHOWN = 6

/** Ring, status, headline, the "por quê" and four KPIs. Meeting mode shows it enlarged (`className`, `ring`). */
export function HealthCard({ h, className, ring }: { h: HealthSummary; className?: string; ring?: number }) {
  return (
    <Card className={className ? `t-health ${className}` : 't-health'}>
      <Ring value={h.inUse} total={h.total} label="entregas" size={ring} />
      <div className="t-health-head">
        <Pill tone={h.status.tone}>{h.status.label}</Pill>
        <h2 className="t-health-title">{h.status.head}</h2>
      </div>
      {h.reasons.length ? (
        <ul className="t-reasons" aria-label="Por quê">
          {h.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      ) : <p className="t-reasons t-reasons-none">Nenhum ponto pede atenção agora.</p>}
      <dl className="t-kpis">
        <div><dt>entregas em uso</dt><dd className="num">{h.inUse}</dd></div>
        <div><dt>próximo marco</dt><dd className="num" title={h.nextKey?.title}>{h.nextKey ? fmtDate(h.nextKey.date) : '—'}</dd></div>
        <div><dt>decisões tomadas</dt><dd className="num">{h.decided}/{h.decisions}</dd></div>
        <div><dt>pendências em aberto</dt><dd className="num">{h.openItems}</dd></div>
      </dl>
    </Card>
  )
}

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
  const health = useMemo(() => healthOf(d, today), [d, today])
  const ms = useMemo(() => milestones(d), [d])
  const next = ms.filter((m) => m.date >= today && !m.done)
  const every = useMemo(() => terralTodos(d), [d])
  const count = (k: TerralTodo['kind']) => every.filter((x) => x.kind === k && !(x.kind === 'to_schedule' && x.item.confirmed_date)).length
  const todos = every.filter((x) => x.kind === tab)
  const shown = all ? todos : todos.slice(0, TODOS_SHOWN)
  const { urgent } = health

  return (
    <>
      <HealthCard h={health} />

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
                {shown.map((x) => <TodoRow key={x.key} x={x} today={today} urgent={urgent} preview={preview} onConfirm={confirm.ask} />)}
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

export function TodoRow({ x, today, urgent, preview, onConfirm }: { x: TerralTodo; today: string; urgent: Set<string | undefined>; preview: boolean; onConfirm: ReturnType<typeof useConfirmDate>['ask'] }) {
  if (x.kind === 'open_item') {
    const o = x.item
    const due = dueTone(o.due, today, urgent.has(o.code))
    return (
      <Row date={o.due} clamp title={o.text}
        detail={[o.effect && `Se não resolver: ${o.effect}`, !o.due && o.due_text].filter(Boolean).join(' · ') || o.owner_public}
        side={due && <Pill tone={due.tone}>{due.label}</Pill>} />
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
