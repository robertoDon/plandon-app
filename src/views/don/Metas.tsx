import type { Goal } from '../../domain/types'
import { usePlanData } from '../../lib/data'
import { Card, Empty, Pill, Sheet } from '../../ui'
import { stateTone } from '../../terral/Goals'
import { GoalForm } from '../../don/GoalForm'
import { useEditor } from '../../don/fields'
import { DonPage } from '../../don/Page'

/** Don: the goal tree, one card per level in sheet order (as Terral's Metas shows it); a row opens the editor. */
export default function Metas() {
  const state = usePlanData()
  const editor = useEditor<Goal>()
  return (
    <DonPage eyebrow="Plano" title="Metas" state={state}
      sub={(d) => `${d.goals.length} metas. A Terral lê tudo o que você escrever aqui.`}>
      {(d) => {
        if (!d.goals.length) return <Card><Empty title="A árvore de metas está vazia." hint="As metas vêm da planilha, aba Árvore de Metas." /></Card>
        const levels = new Map<string, Goal[]>()
        for (const g of [...d.goals].sort((a, b) => a.sort - b.sort)) levels.set(g.level, [...(levels.get(g.level) ?? []), g])
        return (
          <>
            {[...levels].map(([level, gs]) => (
              <Card key={level} title={level}>
                <ul className="don-list" aria-label={level}>
                  {gs.map((g) => (
                    <li key={g.id} className="dgrid-item solo">
                      <button type="button" className="drow-btn goal" onClick={() => editor.show(g)} aria-label={`Editar meta: ${g.level}, ${g.position}, ${g.metric}`}>
                        <span className="drow">
                          <span className="overline">{g.position}</span>
                          <span className="t" style={{ display: 'block' }}>{g.metric}</span>
                          <span className="d" style={{ display: 'block' }}>
                            {[g.baseline && `Partida: ${g.baseline}`, g.target && `Meta: ${g.target}`].filter(Boolean).join(' · ') || 'Sem ponto de partida nem meta'}
                          </span>
                        </span>
                        <span className="drow-side"><Pill tone={stateTone(g.state)}>{g.state}</Pill></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            <Sheet {...editor.sheet(editor.item ? `${editor.item.level} · ${editor.item.position}` : '')}>
              {editor.item && <GoalForm key={editor.item.id} goal={editor.item} onDone={editor.close} />}
            </Sheet>
          </>
        )
      }}
    </DonPage>
  )
}
