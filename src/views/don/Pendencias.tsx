import { useState } from 'react'
import { fmtDate, today as todayOf } from '../../domain/dates'
import type { OpenItem } from '../../domain/types'
import { usePlanData } from '../../lib/data'
import { Card, Check, Empty, Pill, Segmented, Sheet, useToast } from '../../ui'
import { useEditor } from '../../don/fields'
import { byCode } from '../../don/mutations'
import { OpenItemForm, useOpenItemWrite } from '../../don/OpenItemForm'
import { DonPage } from '../../don/Page'

type Kind = OpenItem['kind']

/** Don: P-items (pendências) and X-items (divergências, Don-only). Check resolves with undo; a row opens the edit sheet. */
export default function Pendencias() {
  const state = usePlanData()
  const t = todayOf()
  const [kind, setKind] = useState<Kind>('pendencia')
  const editor = useEditor<OpenItem>()
  const write = useOpenItemWrite()
  const toast = useToast()

  const setStatus = (code: string, status: OpenItem['status'], undoable = true) => {
    // mutateAsync, not mutate's callbacks: each tick needs its own undo
    write.mutateAsync({ update: { status }, match: { code } }).then(
      () => undoable && toast.show(status === 'resolved' ? 'Resolvida.' : 'Reaberta.', { undo: () => setStatus(code, status === 'resolved' ? 'open' : 'resolved', false) }),
      () => {},
    )
  }

  return (
    <DonPage eyebrow="Plano" title="Pendências" state={state}
      sub={(d) => {
        const open = d.open_items.filter((o) => o.kind === 'pendencia' && o.status === 'open').length
        return `${open} ${open === 1 ? 'aberta' : 'abertas'} · ${d.open_items.filter((o) => o.kind === 'divergencia' && o.status === 'open').length} divergências abertas.`
      }}>
      {(d) => {
        const rawOf = new Map(d.open_items_internal.map((r) => [r.code, r.owner_raw]))
        const count = (k: Kind) => d.open_items.filter((o) => o.kind === k).length
        const list = d.open_items.filter((o) => o.kind === kind).sort(byCode)
        return (
          <>
            <Segmented label="Tipo" value={kind} onChange={setKind}
              options={[{ value: 'pendencia', label: `Pendências (${count('pendencia')})` }, { value: 'divergencia', label: `Divergências (${count('divergencia')})` }]} />
            <Card>
              {list.length ? (
                <ul className="don-list" aria-label={kind === 'pendencia' ? 'Pendências' : 'Divergências'}>
                  {list.map((o) => {
                    const late = o.status === 'open' && !!o.due && o.due < t
                    return (
                      <li key={o.code} className="dgrid-item">
                        <Check checked={o.status === 'resolved'} onChange={(v) => setStatus(o.code, v ? 'resolved' : 'open')} label={`Resolver ${o.code}`} />
                        <button type="button" className="drow-btn" onClick={() => editor.show(o)} aria-label={`Editar ${o.code}: ${o.text}`}>
                          <span className="don-code">{o.code}</span>
                          <span className="drow">
                            <span className="t">{o.text}</span>
                            <span className="d" style={{ display: 'block' }}>
                              {o.owner_public}
                              {o.kind === 'pendencia' && ` · ${o.visible_to_terral ? 'a Terral vê' : 'só a Don vê'}`}
                            </span>
                          </span>
                          <span className="drow-side">
                            {o.status === 'resolved' ? <Pill tone="ok">Resolvida</Pill> : late ? <Pill tone="bad">Venceu {fmtDate(o.due!)}</Pill> : <Pill tone="mute">Aberta</Pill>}
                            {o.status === 'open' && !late && <span className="don-when num">{o.due ? `prazo ${fmtDate(o.due)}` : o.due_text ?? 'sem prazo'}</span>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : <Empty title="Nada por aqui." hint="Não há itens deste tipo." />}
            </Card>
            <Sheet {...editor.sheet(editor.item ? `${editor.item.code}` : '')}>
              {editor.item && <OpenItemForm key={editor.item.code} item={editor.item} ownerRaw={rawOf.get(editor.item.code) ?? ''} onDone={editor.close} />}
            </Sheet>
          </>
        )
      }}
    </DonPage>
  )
}
