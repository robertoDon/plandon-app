import { useState, type FormEvent } from 'react'
import type { Goal } from '../domain/types'
import { useToast } from '../ui'
import { FormActions, GuardedField, parseAmount, useTerralGuard } from './fields'
import { useRowWrites } from './plan'

type Draft = Record<'level' | 'position' | 'metric' | 'baseline' | 'state' | 'target', string>
const TEXT: [keyof Draft, string, boolean, string?][] = [
  ['level', 'Nível', true, 'Como na Árvore de Metas: Grupo, Vendas · atacado…'],
  ['position', 'Posição', true, 'Norte, Suporte 1, Operacional 2…'],
  ['metric', 'Métrica', true],
  ['baseline', 'Ponto de partida', false],
  ['state', 'Estado', true, 'Em palavras. A Terral lê como está.'],
  ['target', 'Meta', false],
]

/**
 * Edit one goal. Terral reads every field of a goal, so each text field passes the guard. Saves are optimistic
 * (Terral's Metas page reads the same row) and offer "Desfazer".
 */
export function GoalForm({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const [v, setV] = useState<Draft>({
    level: goal.level, position: goal.position, metric: goal.metric, baseline: goal.baseline ?? '', state: goal.state, target: goal.target ?? '',
  })
  const [sort, setSort] = useState(String(goal.sort))
  const [busy, setBusy] = useState(false)
  const guard = useTerralGuard()
  const w = useRowWrites('goals')
  const toast = useToast()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errors: Record<string, string> = {}
    for (const [k, label, required] of TEXT) if (required && !v[k].trim()) errors[k] = `Escreva ${k === 'level' || k === 'state' ? 'o' : 'a'} ${label.toLowerCase()}.`
    const order = parseAmount(sort, { min: 0, max: 9999, unit: '' })
    if ('error' in order) errors.sort = order.error
    else if (!Number.isInteger(order.value)) errors.sort = 'Use um número inteiro.'
    if (!guard.check(v, errors) || 'error' in order) return

    const after: Record<string, unknown> = { ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null])), sort: order.value }
    const keys = Object.keys(after).filter((k) => after[k] !== goal[k as keyof Goal])
    if (!keys.length) return onDone()
    const pick = (o: Record<string, unknown>) => Object.fromEntries(keys.map((k) => [k, o[k]]))
    setBusy(true)
    try {
      await w.update(goal.id, pick(after), pick(goal as unknown as Record<string, unknown>), undefined)
      toast.show('Meta salva.', { undo: () => void w.update(goal.id, pick(goal as unknown as Record<string, unknown>), pick(after)).catch(() => {}) })
      onDone()
    } catch {
      // useMutate rolled back and said "Não salvou"; the sheet stays open with the draft
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="dform" ref={guard.ref} onSubmit={(e) => void submit(e)} noValidate>
      {TEXT.map(([k, label, required, hint]) => (
        <GuardedField key={k} guard={guard} name={k} label={label} required={required} hint={hint} multiline={k === 'metric' || k === 'baseline' || k === 'target'}
          value={v[k]} onChange={(x) => setV({ ...v, [k]: x })} />
      ))}
      <GuardedField guard={guard} name="sort" label="Ordem na árvore" inputMode="decimal" value={sort} onChange={setSort} hint="Número menor aparece primeiro." />
      <FormActions onCancel={onDone} busy={busy} />
    </form>
  )
}
