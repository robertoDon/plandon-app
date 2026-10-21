import type { Goal } from '../domain/types'
import { Card, Empty, Pill, type Tone } from '../ui'
import { TerralPage } from './Page'

/** State of a goal in words (from the Árvore de Metas); the color only repeats it. */
function stateTone(state: string): Tone {
  const s = state.toLowerCase()
  if (s.includes('ainda não')) return 'mute'
  if (s.includes('sem linha')) return 'warn'
  if (s.includes('apurada') || s.includes('atingid')) return 'ok'
  return 'mute'
}

/** Metas: the goal tree, one card per level in sheet order. */
export function Goals() {
  return (
    <TerralPage eyebrow="Árvore de metas" title="Metas"
      sub={(d) => {
        const levels = new Set(d.goals.map((g) => g.level)).size
        const base = d.goals.filter((g) => stateTone(g.state) === 'ok').length
        return d.goals.length ? `${d.goals.length} metas em ${levels} ${levels === 1 ? 'nível' : 'níveis'}. ${base} com linha de base apurada.` : undefined
      }}>
      {(d) => {
        if (!d.goals.length) return <Card><Empty title="A árvore de metas ainda está vazia." hint="As metas aparecem aqui quando forem definidas." /></Card>
        const levels = new Map<string, Goal[]>()
        for (const g of [...d.goals].sort((a, b) => a.sort - b.sort)) levels.set(g.level, [...(levels.get(g.level) ?? []), g])
        return (
          <div className="t-goals">
            {[...levels].map(([level, gs]) => (
              <Card key={level} title={level}>
                <ul className="t-list">
                  {gs.map((g) => (
                    <li key={g.id} className="t-goal">
                      <div className="t-li-text">
                        <div className="overline">{g.position}</div>
                        <div className="t">{g.metric}</div>
                        <div className="d">
                          {g.baseline && <span>Linha de base: {g.baseline}</span>}
                          {g.target && <span>Meta: {g.target}</span>}
                        </div>
                      </div>
                      <div className="t-li-side"><Pill tone={stateTone(g.state)}>{g.state}</Pill></div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )
      }}
    </TerralPage>
  )
}
