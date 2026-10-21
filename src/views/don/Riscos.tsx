import { useMemo, useState } from 'react'
import { today as todayOf } from '../../domain/dates'
import { evaluate } from '../../domain/risk'
import type { ManualRisk, Severity } from '../../domain/types'
import { usePlanData, useMutate } from '../../lib/data'
import { Card, SEVERITY, Segmented, Sheet, useToast } from '../../ui'
import { useEditor } from '../../don/fields'
import { patchRows } from '../../don/mutations'
import { DonPage } from '../../don/Page'
import { RiskCard } from '../../don/RiskCard'
import { RiskForm } from '../../don/RiskForm'

type Source = 'all' | 'auto' | 'manual'
type Write = { update: { status: ManualRisk['status'] }; match: { id: string } }

/** Don: every risk, automatic (from the engine, honors ?today) and manual. Filter by source, severity, person. */
export default function Riscos() {
  const state = usePlanData()
  const t = todayOf()
  const [source, setSource] = useState<Source>('all')
  const [sev, setSev] = useState<Severity | 'all'>('all')
  const [person, setPerson] = useState('')
  const creating = useEditor<true>()
  const toast = useToast()
  const write = useMutate<Write>('manual_risk', { optimistic: (old, w) => patchRows(old, 'manual_risks', (r) => r.id === w.match.id, w.update) })
  // Shared cached plan: an edit in Equipe re-ranks this list at once.
  const risks = useMemo(() => (state.data ? evaluate(state.data, t).risks : []), [state.data, t])

  const setStatus = (id: string, status: ManualRisk['status'], undoable = true) => {
    write.mutateAsync({ update: { status }, match: { id } }).then(
      () => undoable && toast.show(status === 'closed' ? 'Risco encerrado.' : 'Risco reaberto.', { undo: () => setStatus(id, status === 'closed' ? 'open' : 'closed', false) }),
      () => {},
    )
  }

  return (
    <DonPage eyebrow="Plano" title="Riscos" state={state}
      sub={() => `${risks.length} ${risks.length === 1 ? 'aberto' : 'abertos'}, do mais grave ao menos grave.`}>
      {(d) => {
        const shown = risks.filter((r) =>
          (source === 'all' || (source === 'manual') === (r.rule === 'manual')) && (sev === 'all' || r.severity === sev) && (!person || r.person_id === person))
        const closed = d.manual_risks.filter((m) => m.status === 'closed')
        return (
          <>
            <div className="dfilters">
              <Segmented label="Origem" value={source} onChange={setSource}
                options={[{ value: 'all', label: 'Todos' }, { value: 'auto', label: 'Automáticos' }, { value: 'manual', label: 'Manuais' }]} />
              <Segmented label="Gravidade" value={sev} onChange={setSev}
                options={[{ value: 'all', label: 'Todas' }, ...(['high', 'medium', 'low'] as const).map((s) => ({ value: s, label: SEVERITY[s].label }))]} />
              <select aria-label="Pessoa" value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">Todas as pessoas</option>
                {[...d.people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <RiskCard risks={shown} people={d.people} title={`Riscos (${shown.length})`} empty={risks.length ? 'Nenhum risco com esses filtros.' : 'Nenhum risco aberto.'}
              action={<button type="button" onClick={() => creating.show(true)}>Novo risco</button>}
              rowAction={(r) => r.rule === 'manual' && <button type="button" className="dlink" onClick={() => setStatus(r.id, 'closed')} aria-label={`Encerrar: ${r.title}`}>Encerrar</button>} />
            {!!closed.length && (
              <Card title={`Encerrados (${closed.length})`}>
                <ul className="don-list">
                  {closed.map((m) => (
                    <li key={m.id} className="don-pend" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                      <span>{m.title}</span>
                      <button type="button" className="dlink" onClick={() => setStatus(m.id, 'open')} aria-label={`Reabrir: ${m.title}`}>Reabrir</button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <Sheet {...creating.sheet('Novo risco')}>
              {creating.item && <RiskForm people={d.people} deliverables={d.deliverables} onDone={creating.close} />}
            </Sheet>
          </>
        )
      }}
    </DonPage>
  )
}
