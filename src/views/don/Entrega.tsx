import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { fmtDate, fmtHours, type ISODate } from '../../domain/dates'
import { evaluate } from '../../domain/risk'
import type { Block, Deliverable, Dependency, Task, Traceability } from '../../domain/types'
import { usePlanData, type DonData } from '../../lib/data'
import { Card, Check, Empty, Pill, Sheet } from '../../ui'
import { BlockForm } from '../../don/BlockForm'
import { byOrder, useToday, useToggleBlock } from '../../don/blocks'
import { DeliverableForm, DependencyForm, depLabel, TaskForm, taskStatusLabel, TraceForm } from '../../don/DeliverableForms'
import { FormActions, GuardedField, Switch, useEditor, useTerralGuard } from '../../don/fields'
import { HEALTH, newId, nextOf, personName, progressOf, PROJECT, typeOf, useRowWrites, weekCode } from '../../don/plan'
import { Comments } from '../../shared/Comments'
import { Evidence } from '../../shared/Evidence'
import { HistoryList } from '../../shared/HistoryList'
import '../../don/don.css'
import '../../don/plan.css'

const h = (n: number) => fmtHours(n)

/** Don: one deliverable. Situation and toggles, the note Terral reads, tasks and blocks, dependencies, Anexo A, comments, files, history. */
export default function Entrega() {
  const { code = '' } = useParams()
  const { data, status } = usePlanData()
  const t = useToday()
  const dl = data?.deliverables.find((x) => x.code === code)
  const health = useMemo(() => (data ? evaluate(data, t).health : {}), [data, t])

  return (
    <div className="don-page dlv">
      <Link className="dlink dlv-back" to="/don/entregas"><span aria-hidden="true">‹ </span>Entregas e tarefas</Link>
      <header className="don-head">
        <div className="eyebrow">{dl ? `Entrega ${dl.code} · ${dl.front} · ${dl.origin === 'escopo2' ? 'Escopo 2' : 'Instrumento'}` : 'Entrega'}</div>
        <h1>{dl?.name ?? (status === 'pending' ? 'Carregando…' : `Entrega ${code}`)}</h1>
      </header>
      {data && dl ? <Detail d={data} dl={dl} t={t} health={HEALTH[health[dl.code] ?? 'on_time']} />
        : status !== 'pending' && (
          <Card>
            <Empty title={data ? 'Entrega não encontrada.' : 'Não deu para carregar os dados.'} hint={data ? `Não há entrega com o código ${code}.` : 'Confira a internet e recarregue a página.'}>
              <Link className="dlink" to="/don/entregas">Ver todas as entregas</Link>
            </Empty>
          </Card>
        )}
    </div>
  )
}

function Detail({ d, dl, t, health }: { d: DonData; dl: Deliverable; t: ISODate; health: (typeof HEALTH)[keyof typeof HEALTH] }) {
  const edit = useEditor<true>()
  const p = progressOf(dl.code, d.blocks)
  return (
    <>
      <Card title="Situação" action={<button type="button" onClick={() => edit.show(true)}>Editar</button>}>
        <div className="dlv-sum">
          <Pill tone={health.tone}>{health.label}</Pill>
          <span className="dlv-prog wide">
            <progress max={100} value={p.pct} aria-label={`Progresso: ${h(p.done)} de ${h(p.planned)}`} />
            <span className="num">{h(p.done).slice(0, -2)} de {h(p.planned)} feitas ({p.pct}%)</span>
          </span>
        </div>
        <dl className="dlv-facts">
          <div><dt>Próximo marco</dt><dd>{nextOf(dl)}</dd></div>
          <div><dt>Construção prevista</dt><dd>{dl.built_date ? fmtDate(dl.built_date, true) : '—'}</dd></div>
          <div><dt>Uso previsto</dt><dd>{dl.in_use_start ? `${fmtDate(dl.in_use_start, true)}${dl.in_use_end && dl.in_use_end !== dl.in_use_start ? ` a ${fmtDate(dl.in_use_end, true)}` : ''}` : dl.in_use_text ?? '—'}{dl.in_use_confirmed && ' · data confirmada'}</dd></div>
          <div><dt>Dono do uso na Terral</dt><dd>{dl.terral_owner ?? '—'}</dd></div>
          <div><dt>Rito de destino</dt><dd>{dl.target_ritual ?? '—'}</dd></div>
        </dl>
        <Milestone dl={dl} field="built_at" label="Construído" done="marcada como construída" hint="A Don aceitou a entrega como construída." t={t} />
        <Milestone dl={dl} field="in_use_at" label="Em uso" done="marcada em uso" hint="A Terral já usa a entrega no dia a dia." t={t} />
      </Card>
      <PublishedNote dl={dl} />
      <Tasks d={d} dl={dl} t={t} />
      <Dependencies d={d} dl={dl} />
      <Annex rows={d.traceability.filter((r) => r.deliverable_code === dl.code)} />
      <Card title="Comentários"><Comments entity_kind="deliverable" entity_ref={dl.code} canHide /></Card>
      <Card title="Arquivos"><Evidence entity_kind="deliverable" entity_ref={dl.code} /></Card>
      <Card title="Histórico"><HistoryList table="deliverable" row_ref={dl.code} /></Card>
      <Sheet {...edit.sheet(`Editar ${dl.code}`)}>{edit.item && <DeliverableForm d={dl} onDone={edit.close} />}</Sheet>
    </>
  )
}

/** "Construído" / "Em uso": a switch (today when turned on) and its date. Optimistic, with "Desfazer". */
function Milestone({ dl, field, label, done, hint, t }: { dl: Deliverable; field: 'built_at' | 'in_use_at'; label: string; done: string; hint: string; t: ISODate }) {
  const w = useRowWrites('deliverables', 'code')
  const at = dl[field]
  const save = (v: ISODate | null, msg: string) => void w.update(dl.code, { [field]: v }, { [field]: at }, msg).catch(() => {})
  return (
    <div className="dlv-ms">
      <Switch checked={!!at} label={label} hint={at ? `Desde ${fmtDate(at, true)}.` : hint}
        onChange={(on) => save(on ? t : null, on ? `${dl.code} ${done}.` : `"${label}" desmarcado.`)} />
      {at && (
        <label className="dlv-date">
          <span>Data de {label.toLowerCase()}</span>
          <input type="date" value={at} onChange={(e) => e.target.value && e.target.value !== at && save(e.target.value, 'Data salva.')} />
        </label>
      )}
    </div>
  )
}

/** The note Terral reads (published_flag). A published note puts the deliverable in "Atenção" for both sides. */
function PublishedNote({ dl }: { dl: Deliverable }) {
  const [on, setOn] = useState(!!dl.published_flag)
  const [text, setText] = useState(dl.published_flag ?? '')
  const [busy, setBusy] = useState(false)
  const guard = useTerralGuard()
  const w = useRowWrites('deliverables', 'code')
  useEffect(() => {
    setOn(!!dl.published_flag)
    setText(dl.published_flag ?? '')
  }, [dl.published_flag])
  const next = on ? text.trim() : null
  const dirty = next !== (dl.published_flag ?? null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (on && !guard.check({ published_flag: text }, text.trim() ? {} : { published_flag: 'Escreva a nota que a Terral vai ler.' })) return
    setBusy(true)
    try {
      await w.update(dl.code, { published_flag: next }, { published_flag: dl.published_flag }, next ? 'Atenção publicada para a Terral.' : 'Atenção retirada.')
    } catch {
      /* rolled back with a toast; the draft stays */
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Atenção para a Terral">
      <form className="dform" ref={guard.ref} onSubmit={(e) => void submit(e)} noValidate>
        <Switch checked={on} onChange={(v) => { setOn(v); if (!v) guard.clear('published_flag') }} label="Publicar atenção"
          hint="A Terral vê a nota e a entrega aparece em Atenção. Use para avisar de um problema interno que importa para ela." />
        {on && <GuardedField guard={guard} name="published_flag" label="Nota que a Terral lê" multiline value={text} onChange={setText} />}
        {dirty && <FormActions busy={busy} onCancel={() => { setOn(!!dl.published_flag); setText(dl.published_flag ?? ''); guard.clear('published_flag') }} save={on ? 'Publicar' : 'Retirar'} />}
      </form>
    </Card>
  )
}

type BlockEdit = { block: Block; isNew?: boolean }

/** Tasks (sorted as in the sheet), each with its blocks; then blocks of this deliverable with no task. */
function Tasks({ d, dl, t }: { d: DonData; dl: Deliverable; t: ISODate }) {
  const tasks = d.tasks.filter((x) => x.code === dl.code).sort((a, b) => a.sort - b.sort || a.description.localeCompare(b.description, 'pt-BR'))
  const ids = new Set(tasks.map((x) => x.id))
  const loose = d.blocks.filter((b) => b.code === dl.code && (!b.task_id || !ids.has(b.task_id))).sort(byOrder)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const taskEd = useEditor<{ task: Task; isNew?: boolean }>()
  const blockEd = useEditor<BlockEdit>()
  const toggle = useToggleBlock()
  const flip = (id: string) => setOpen((s) => {
    const n = new Set(s)
    if (!n.delete(id)) n.add(id)
    return n
  })

  const newTask = (): Task => ({
    id: newId(), sort: Math.max(0, ...d.tasks.map((x) => x.sort)) + 1, due: null, kind: 'task', front: dl.front, code: dl.code,
    description: '', person_id: null, status: 'not_started',
  })
  const newBlock = (task: Task | null): Block => {
    const date = t < PROJECT.start ? PROJECT.start : t > PROJECT.end ? PROJECT.end : t
    return {
      id: newId(), date, week: weekCode(date), type: task?.kind === 'with_terral' ? 'Tarefa com a Terral' : 'Tarefa', front: dl.front, code: dl.code,
      description: task?.description ?? '', person_id: task?.person_id ?? null, hours: 1, due: task?.due ?? null, task_id: task?.id ?? null, done: false, done_at: null,
    }
  }

  const blocksOf = (bs: Block[], task: Task | null, key: string) => {
    const planned = bs.reduce((s, b) => s + b.hours, 0)
    const done = bs.filter((b) => b.done).reduce((s, b) => s + b.hours, 0)
    const isOpen = open.has(key)
    return (
      <>
        <button type="button" className="dlink dtask-more" aria-expanded={isOpen} onClick={() => flip(key)}>
          {isOpen ? 'Ocultar blocos' : `${bs.length ? `Ver ${bs.length} ${bs.length === 1 ? 'bloco' : 'blocos'}` : 'Sem blocos'}`}
          <span className="dtask-h num"> · {h(done).slice(0, -2)} de {h(planned)}</span>
        </button>
        {isOpen && (
          <>
            {!!bs.length && (
              <ul className="don-list don-blocks" aria-label={task ? `Blocos de ${task.description}` : 'Blocos sem tarefa'}>
                {bs.map((b) => (
                  <li key={b.id} className={b.done ? 'don-block dblock done' : 'don-block dblock'}>
                    <Check checked={b.done} onChange={(v) => toggle(b.id, v)} label={`Feito: ${b.description}, ${fmtDate(b.date)}`} />
                    <button type="button" className="dblock-open" onClick={() => blockEd.show({ block: b })} aria-label={`Editar bloco de ${fmtDate(b.date)}: ${b.description}`}>
                      <span className="t">{fmtDate(b.date)} · {b.description}</span>
                      <span className="d">{personName(d, b.person_id)} · {typeOf(b.type).label}{b.done ? ' · feito' : ''}</span>
                    </button>
                    <span className="don-block-h num">{h(b.hours)}</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="dlink" onClick={() => blockEd.show({ block: newBlock(task), isNew: true })}>Novo bloco</button>
          </>
        )}
      </>
    )
  }

  return (
    <Card title={`Tarefas (${tasks.length})`} action={<button type="button" onClick={() => taskEd.show({ task: newTask(), isNew: true })}>Nova tarefa</button>}>
      {tasks.length || loose.length ? (
        <ul className="don-list dtasks">
          {tasks.map((x) => {
            const late = x.status !== 'done' && !!x.due && x.due < t
            return (
              <li key={x.id} className="dtask">
                <button type="button" className="dtask-open" onClick={() => taskEd.show({ task: x })} aria-label={`Editar tarefa: ${x.description}`}>
                  <span className="t">{x.description}</span>
                  <span className="d">{personName(d, x.person_id).replace('Diretoria Terral', 'Sem responsável')}{x.due ? ` · prazo ${fmtDate(x.due)}` : ''}</span>
                </button>
                <span className="dtask-side">
                  {x.status === 'done' ? <Pill tone="ok">Concluída</Pill> : late ? <Pill tone="bad">Venceu {fmtDate(x.due!)}</Pill> : <Pill tone="mute">{taskStatusLabel(x.status)}</Pill>}
                </span>
                {blocksOf(d.blocks.filter((b) => b.task_id === x.id).sort(byOrder), x, x.id)}
              </li>
            )
          })}
          {!!loose.length && (
            <li className="dtask">
              <span className="dtask-open static"><span className="t">Blocos sem tarefa</span><span className="d">Ritos e blocos da entrega fora de uma tarefa</span></span>
              <span className="dtask-side" />
              {blocksOf(loose, null, '_loose')}
            </li>
          )}
        </ul>
      ) : <Empty title="Nenhuma tarefa ainda." hint="Crie a primeira tarefa desta entrega." />}
      <Sheet {...taskEd.sheet(taskEd.item?.isNew ? 'Nova tarefa' : 'Tarefa')}>
        {taskEd.item && <TaskForm key={taskEd.item.task.id} task={taskEd.item.task} isNew={taskEd.item.isNew} data={d} onDone={taskEd.close} />}
      </Sheet>
      <Sheet {...blockEd.sheet(blockEd.item?.isNew ? 'Novo bloco' : 'Bloco')}>
        {blockEd.item && <BlockForm key={blockEd.item.block.id} block={blockEd.item.block} isNew={blockEd.item.isNew} data={d} onDone={blockEd.close} />}
      </Sheet>
    </Card>
  )
}

/** What holds this deliverable up (and confirms suggested links), and what it holds up. */
function Dependencies({ d, dl }: { d: DonData; dl: Deliverable }) {
  const add = useEditor<true>()
  const w = useRowWrites('dependencies')
  const on = d.dependencies.filter((x) => x.to_code === dl.code)
    .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.from_kind.localeCompare(b.from_kind) || a.from_ref.localeCompare(b.from_ref, 'pt-BR', { numeric: true }))
  const holds = d.dependencies.filter((x) => x.from_kind === 'deliverable' && x.from_ref === dl.code)
  const status = (x: Dependency) => {
    if (x.from_kind === 'decision') return d.decisions.find((y) => y.code === x.from_ref)?.status === 'decided' ? 'decidida' : 'pendente'
    if (x.from_kind === 'open_item') return d.open_items.find((y) => y.code === x.from_ref)?.status === 'resolved' ? 'resolvida' : 'aberta'
    return null
  }
  const remove = (x: Dependency) => void w.remove(x as unknown as Record<string, unknown>, 'Dependência removida.').catch(() => {})
  const row = (x: Dependency, label: string) => (
    <li key={x.id} className="ddep">
      <span className="ddep-t">
        <span className="t">{label}</span>
        {status(x) && <span className="d"> · {status(x)}</span>}
      </span>
      <span className="ddep-act">
        {x.suggested && <Pill tone="mute">Sugerida</Pill>}
        {x.suggested && (
          <button type="button" className="dlink" aria-label={`Confirmar: ${label}`}
            onClick={() => void w.update(x.id, { suggested: false }, { suggested: true }, 'Dependência confirmada.').catch(() => {})}>Confirmar</button>
        )}
        <button type="button" className="dlink" aria-label={`Remover: ${label}`} onClick={() => remove(x)}>Remover</button>
      </span>
    </li>
  )
  return (
    <Card title="Dependências" action={<button type="button" onClick={() => add.show(true)}>Adicionar</button>}>
      <h3 className="dsub">{dl.code} depende de</h3>
      {on.length ? <ul className="don-list" aria-label={`${dl.code} depende de`}>{on.map((x) => row(x, depLabel(d, x.from_kind, x.from_ref)))}</ul>
        : <p className="don-quiet">Nada segura esta entrega.</p>}
      <h3 className="dsub">{dl.code} segura</h3>
      {holds.length ? <ul className="don-list" aria-label={`${dl.code} segura`}>{holds.map((x) => row(x, depLabel(d, 'deliverable', x.to_code)))}</ul>
        : <p className="don-quiet">Nenhuma entrega espera por esta.</p>}
      <Sheet {...add.sheet(`${dl.code} depende de…`)}>{add.item && <DependencyForm code={dl.code} data={d} onDone={add.close} />}</Sheet>
    </Card>
  )
}

/** Anexo A fields this deliverable fills (traceability). Don-only. */
function Annex({ rows }: { rows: Traceability[] }) {
  const ed = useEditor<Traceability>()
  const sorted = [...rows].sort((a, b) => a.annex_tab.localeCompare(b.annex_tab, 'pt-BR') || a.n - b.n)
  return (
    <Card title={`Anexo A (${rows.length})`}>
      {sorted.length ? (
        <ul className="don-list" aria-label="Anexo A">
          {sorted.map((r) => (
            <li key={r.id}>
              <button type="button" className="drow-btn dannex" onClick={() => ed.show(r)} aria-label={`Editar campo ${r.field}`}>
                <span className="don-code">{r.n ? `Nº ${r.n}` : '—'}</span>
                <span className="drow">
                  <span className="t">{r.annex_tab} · {r.field}{r.col ? ` · ${r.col}` : ''}</span>
                  <span className="d" style={{ display: 'block' }}>{r.task_description} · {r.filled_by}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="don-quiet">Nenhum campo do Anexo A aponta para esta entrega.</p>}
      <p className="dnote dlv-only">Só a Don vê o Anexo A.</p>
      <Sheet {...ed.sheet('Campo do Anexo A')}>{ed.item && <TraceForm key={ed.item.id} row={ed.item} onDone={ed.close} />}</Sheet>
    </Card>
  )
}
