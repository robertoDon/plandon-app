import { fmtDate, fmtHours, today as todayOf } from '../../domain/dates'
import type { ToSchedule } from '../../domain/types'
import { usePlanData } from '../../lib/data'
import { Card, Check, Empty, Pill, Sheet } from '../../ui'
import { useEditor } from '../../don/fields'
import { byCode } from '../../don/mutations'
import { DonPage } from '../../don/Page'
import { personName } from '../../don/plan'
import { ScheduleForm, useDistribute } from '../../don/ScheduleForm'

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const h1 = (h: number) => fmtHours(Math.round(h * 10) / 10)

/** Don: "A agendar". Hours to schedule per item (Don-only), the window, the date Terral confirmed, and whether Don has spread the hours into blocks. */
export default function Agendar() {
  const state = usePlanData()
  const t = todayOf()
  const editor = useEditor<ToSchedule>()
  const distribute = useDistribute()

  return (
    <DonPage eyebrow="Plano" title="A agendar" state={state}
      sub={(d) => `${d.to_schedule.length} ${d.to_schedule.length === 1 ? 'item' : 'itens'}. A Terral confirma a data; você distribui as horas em blocos.`}>
      {(d) => {
        const plan = new Map(d.to_schedule_plan.map((p) => [p.to_schedule_id, p]))
        const hours = (pred: (s: ToSchedule, p: { hours: number; distributed: boolean }) => boolean) =>
          sum(d.to_schedule.flatMap((s) => { const p = plan.get(s.id); return p && pred(s, p) ? [p.hours] : [] }))
        const list = [...d.to_schedule].sort((a, b) => byCode(a, b) || a.id.localeCompare(b.id, 'pt-BR', { numeric: true }))
        return (
          <>
            <div className="dstats" aria-label="Horas">
              <div className="dstat"><span className="overline">A agendar</span><b>{h1(hours((_, p) => !p.distributed))}</b></div>
              <div className="dstat"><span className="overline">Confirmadas, sem blocos</span><b>{h1(hours((s, p) => !!s.confirmed_date && !p.distributed))}</b></div>
              <div className="dstat"><span className="overline">Distribuídas</span><b>{h1(hours((_, p) => p.distributed))}</b></div>
            </div>
            <Card>
              {list.length ? (
                <ul className="don-list" aria-label="Itens a agendar">
                  {list.map((s) => {
                    const p = plan.get(s.id)
                    const late = !s.confirmed_date && !!s.window_end && s.window_end < t
                    return (
                      <li key={s.id} className="dgrid-item">
                        <Check checked={!!p?.distributed} disabled={!p} onChange={(v) => distribute(s.id, v)} label={`Distribuída: ${s.id}`} />
                        <button type="button" className="drow-btn" onClick={() => editor.show(s)} aria-label={`Editar ${s.id}: ${s.what}`}>
                          <span className="don-code">{s.id}</span>
                          <span className="drow">
                            <span className="t">{s.what}</span>
                            <span className="d" style={{ display: 'block' }}>
                              {p ? `${h1(p.hours)}${p.person_id ? ` · ${personName(d, p.person_id)}` : ''}` : 'Sem horas'} · {s.window_text ?? 'janela a definir'}
                            </span>
                          </span>
                          <span className="drow-side">
                            {s.confirmed_date ? <Pill tone="ok">Confirmada {fmtDate(s.confirmed_date)}</Pill> : late ? <Pill tone="bad">Janela fechou {fmtDate(s.window_end!)}</Pill> : <Pill tone="mute">Sem data</Pill>}
                            {p && <Pill tone={p.distributed ? 'ok' : s.confirmed_date ? 'warn' : 'mute'}>{p.distributed ? 'Distribuída' : 'A distribuir'}</Pill>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : <Empty title="Nada a agendar." hint="Os itens vêm da planilha, aba A Agendar." />}
            </Card>
            <Sheet {...editor.sheet(editor.item ? editor.item.id : '')}>
              {editor.item && <ScheduleForm key={editor.item.id} item={editor.item} plan={plan.get(editor.item.id)} data={d} onDone={editor.close} />}
            </Sheet>
          </>
        )
      }}
    </DonPage>
  )
}
