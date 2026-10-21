import { Link, useParams } from 'react-router'
import { fmtDate } from '../domain/dates'
import { evaluate } from '../domain/risk'
import type { TerralData } from '../domain/terralView'
import type { Deliverable } from '../domain/types'
import { Card, Empty, Pill } from '../ui'
import { useToday } from '../shared/useToday'
import { Comments } from '../shared/Comments'
import { Evidence } from '../shared/Evidence'
import { useConfirmDate } from './actions'
import { deliverableStatus, inUseText, terralReasons } from './model'
import { PREVIEW_HINT, Row, TerralPage, useTerralCtx } from './Page'

const ORIGIN: Record<Deliverable['origin'], string> = { escopo2: 'Escopo 2', instrumento: 'Instrumento' }

/** One deliverable: status, dates, the Terral owner of use, the target ritual, what it waits on, comments and files. */
export function DeliverableDetail() {
  const { code = '' } = useParams()
  const { base } = useTerralCtx()
  const find = (d?: TerralData) => d?.deliverables.find((x) => x.code === code)
  return (
    <TerralPage
      back={<Link className="t-back" to={`${base}/entregas`}><span aria-hidden="true">‹</span> Entregas</Link>}
      eyebrow={(d) => { const x = find(d); return x ? `Entrega ${x.code} · ${x.front}` : 'Entrega' }}
      title={(d) => find(d)?.name ?? (d ? 'Entrega não encontrada' : code)}>
      {(d) => {
        const x = find(d)
        return x ? <Body d={d} x={x} /> : (
          <Card><Empty title="Não achamos esta entrega." hint="Ela pode ter mudado de código. Veja a lista completa."><Link className="dlink" to={`${base}/entregas`}>Ver as entregas</Link></Empty></Card>
        )
      }}
    </TerralPage>
  )
}

function Body({ d, x }: { d: TerralData; x: Deliverable }) {
  const t = useToday()
  const { base, preview } = useTerralCtx()
  const confirm = useConfirmDate()
  const result = evaluate(d, t)
  const s = deliverableStatus(x, result.health[x.code])
  // why it needs attention, in executive words built from the engine's risks on Terral's data
  const why = x.in_use_at ? [] : terralReasons(result, d, t, { only: x.code })
  const schedule = d.to_schedule.filter((y) => y.code === x.code)
  const deps = d.dependencies.filter((y) => y.to_code === x.code && !y.suggested)
  const off = preview ? { disabled: true, title: PREVIEW_HINT } : {}

  return (
    <>
      <Card className="t-detail">
        <div className="t-detail-hd">
          <Pill tone={s.tone}>{s.label}</Pill>
          {x.in_use_confirmed && !x.in_use_at && <Pill tone="ok">data confirmada</Pill>}
        </div>
        {why.length > 0 && <ul className="t-reasons t-why" aria-label="Por quê">{why.map((w) => <li key={w}>{w}</li>)}</ul>}
        {x.published_flag && <p className="t-flag"><b>Aviso da Equipe Don:</b> {x.published_flag}</p>}
        <dl className="t-facts">
          <div><dt>Construção</dt><dd>{x.built_at ? `Concluída em ${fmtDate(x.built_at, true)}` : x.built_date ? `Prevista para ${fmtDate(x.built_date, true)}` : 'A definir'}</dd></div>
          <div><dt>Uso</dt><dd>{x.in_use_at ? `Em uso desde ${fmtDate(x.in_use_at, true)}` : x.in_use_confirmed ? `Combinado para ${inUseText(x)}` : inUseText(x)}</dd></div>
          <div><dt>Dono do uso na Terral</dt><dd>{x.terral_owner ?? 'A definir'}</dd></div>
          <div><dt>Rito de destino</dt><dd>{x.target_ritual ?? 'A definir'}</dd></div>
          <div><dt>Origem</dt><dd>{ORIGIN[x.origin] ?? x.origin}</dd></div>
        </dl>
        {!x.in_use_at && (
          <div className="t-detail-act">
            <button type="button" className="dbtn primary small" {...off}
              onClick={() => confirm.ask({
                kind: 'deliverable', ref: x.code, title: `Data de uso de ${x.code} ${x.name}`,
                initial: x.in_use_start && x.in_use_start >= t ? x.in_use_start : null,
                hint: 'Confirmar a data não marca a entrega como em uso. Quem marca é a Equipe Don, quando o uso começar.',
              })}>{x.in_use_confirmed ? 'Mudar data de uso' : 'Confirmar data de uso'}</button>
            {preview && <p className="dfield-hint">{PREVIEW_HINT}</p>}
          </div>
        )}
      </Card>

      {(schedule.length > 0 || deps.length > 0) && (
        <div className="t-two">
          {schedule.length > 0 && (
            <Card title="Agendas com a Terral">
              <ul className="t-list">
                {schedule.map((y) => (
                  <Row key={y.id} date={y.confirmed_date ?? y.window_end} title={y.what}
                    detail={y.confirmed_date ? `Combinado para ${fmtDate(y.confirmed_date, true)}` : `Janela: ${y.window_text ?? 'a definir'}`}
                    side={y.confirmed_date ? <Pill tone="ok">data confirmada</Pill> : (
                      <button type="button" className="dbtn small" {...off} aria-label={`Confirmar data: ${y.what}`}
                        onClick={() => confirm.ask({ kind: 'to_schedule', ref: y.id, title: y.what, initial: y.window_start && y.window_start >= t ? y.window_start : null, hint: y.window_text ? `Janela combinada: ${y.window_text}.` : undefined })}>
                        Confirmar data
                      </button>
                    )} />
                ))}
              </ul>
            </Card>
          )}
          {deps.length > 0 && (
            <Card title="Depende de">
              <ul className="t-list">
                {deps.map((y) => <Dep key={y.id} d={d} kind={y.from_kind} ref_={y.from_ref} base={base} />)}
              </ul>
            </Card>
          )}
        </div>
      )}

      <div className="t-two">
        <Card title="Comentários"><Comments entity_kind="deliverable" entity_ref={x.code} canHide={false} preview={preview} /></Card>
        <Card title="Arquivos"><Evidence entity_kind="deliverable" entity_ref={x.code} preview={preview} /></Card>
      </div>
      {confirm.sheet}
    </>
  )
}

/** One thing this deliverable waits on, with its state in words. */
function Dep({ d, kind, ref_, base }: { d: TerralData; kind: string; ref_: string; base: string }) {
  if (kind === 'decision') {
    const x = d.decisions.find((y) => y.code === ref_)
    if (!x) return null
    return <Row date={x.date} title={<Link className="t-link" to={`${base}/decisoes`}>{x.title}</Link>} detail={`Decisão ${x.code}`}
      side={x.status === 'decided' ? <Pill tone="ok">Decidida</Pill> : <Pill tone="mute">Pendente</Pill>} />
  }
  if (kind === 'open_item') {
    const x = d.open_items.find((y) => y.code === ref_)
    if (!x) return null
    return <Row date={x.due} clamp title={x.text} detail={`Pendência · ${x.owner_public}`}
      side={x.status === 'resolved' ? <Pill tone="ok">Resolvida</Pill> : <Pill tone="mute">Aberta</Pill>} />
  }
  if (kind === 'deliverable') {
    const x = d.deliverables.find((y) => y.code === ref_)
    if (!x) return null
    return <Row date={x.in_use_start} title={<Link className="t-link" to={`${base}/entregas/${encodeURIComponent(x.code)}`}>{x.name}</Link>} detail={`Entrega ${x.code}`}
      side={x.in_use_at ? <Pill tone="ok">Em uso</Pill> : <Pill tone="mute">A caminho</Pill>} />
  }
  const x = d.to_schedule.find((y) => y.id === ref_)
  if (!x) return null
  return <Row date={x.confirmed_date ?? x.window_end} title={x.what} detail="Agenda com a Terral"
    side={x.confirmed_date ? <Pill tone="ok">data confirmada</Pill> : <Pill tone="mute">Sem data</Pill>} />
}
