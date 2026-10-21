import { useState } from 'react'
import { usePlanData } from '../../lib/data'
import { Card } from '../../ui'
import { DonPage } from '../../don/Page'
import { HistoryList, SYSTEM_USER } from '../../shared/HistoryList'
import { HISTORY_TABLES } from '../../shared/historyText'

/** Don: every change, newest first, grouped by day. Filter by what changed and by who changed it. */
export default function Historico() {
  const state = usePlanData()
  const [table, setTable] = useState('')
  const [user, setUser] = useState('')
  return (
    <DonPage eyebrow="Administração" title="Histórico" state={state} sub={() => 'Quem mudou o quê, e quando. O mais recente primeiro.'}>
      {(d) => (
        <>
          <div className="dfilters">
            <select aria-label="O que mudou" value={table} onChange={(e) => setTable(e.target.value)}>
              <option value="">Tudo</option>
              {HISTORY_TABLES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select aria-label="Quem mudou" value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="">Todas as pessoas</option>
              {[...d.profiles].sort((a, b) => a.display_name.localeCompare(b.display_name, 'pt-BR')).map((p) => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
              <option value={SYSTEM_USER}>Sistema (importação)</option>
            </select>
          </div>
          <Card>
            <HistoryList table={table || undefined} user={user || undefined} subject />
          </Card>
        </>
      )}
    </DonPage>
  )
}
