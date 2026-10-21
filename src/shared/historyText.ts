import { fmtDate, fmtHours } from '../domain/dates'
import type { HistoryRow } from '../domain/types'

// One pt-BR sentence per history row (spec §10). The trigger stores whole rows in old/new; only the fields that
// changed speak. Never throws: old/new may be missing or not objects.

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})

/** Table → the thing, with its article ("o bloco"). */
const THING: Record<string, string> = {
  block: 'o bloco', task: 'a tarefa', deliverable: 'a entrega', open_item: 'a pendência', decision: 'a decisão',
  dependency: 'a dependência', comment: 'o comentário', evidence: 'o arquivo', profiles: 'o acesso', person: 'a pessoa',
  manual_risk: 'o risco', to_schedule: 'o agendamento', to_schedule_plan: 'o plano do agendamento', goal: 'a meta',
  traceability: 'o campo do Anexo A', ritual: 'o rito', ritual_occurrence: 'a data do rito', open_item_internal: 'o responsável interno',
}

type Kind = 'date' | 'hours' | 'person' | 'text' | 'plain'
/** Field → label with article and how its value reads. */
const FIELD: Record<string, [string, Kind]> = {
  date: ['a data', 'date'], hours: ['as horas', 'hours'], person_id: ['a pessoa', 'person'], description: ['a descrição', 'text'],
  type: ['o tipo', 'plain'], due: ['o prazo', 'date'], front: ['a frente', 'plain'], code: ['o código', 'plain'], kind: ['o tipo', 'plain'],
  name: ['o nome', 'text'], terral_owner: ['o dono do uso na Terral', 'text'], target_ritual: ['o rito de destino', 'text'],
  built_date: ['a data prevista de construção', 'date'], in_use_start: ['o início do uso', 'date'], in_use_end: ['o fim do uso', 'date'],
  in_use_text: ['o texto da data de uso', 'text'], text: ['o texto', 'text'], owner_public: ['o responsável', 'text'], effect: ['o efeito', 'text'],
  due_text: ['o texto do prazo', 'text'], title: ['o título', 'text'], outcome: ['o resultado', 'text'], decided_by: ['quem decidiu', 'text'],
  decided_at: ['a data da decisão', 'date'], prepared_on: ['a data de preparação', 'date'], net_capacity_h: ['a capacidade líquida', 'hours'],
  daily_cap_h: ['o limite por dia', 'hours'], weekly_cap_h: ['o limite por semana', 'hours'], reserved_h: ['as horas reservadas', 'hours'],
  severity: ['a gravidade', 'plain'], note: ['a nota', 'text'], what: ['o que é', 'text'], window_start: ['o início da janela', 'date'],
  window_end: ['o fim da janela', 'date'], window_text: ['o texto da janela', 'text'], confirmed_date: ['a data confirmada', 'date'],
  display_name: ['o nome', 'text'], annex_tab: ['a aba', 'text'], field: ['o campo', 'text'], col: ['a coluna', 'text'], n: ['o número', 'plain'],
  task_description: ['a tarefa que produz', 'text'], filled_by: ['quem preenche', 'text'], body: ['o texto', 'text'],
  file_name: ['o nome do arquivo', 'text'], links: ['os itens ligados', 'plain'], owner_raw: ['o responsável interno', 'text'],
  metric: ['a métrica', 'text'], baseline: ['o ponto de partida', 'text'], target: ['a meta', 'text'], state: ['o estado', 'plain'],
  level: ['o nível', 'plain'], position: ['a posição', 'text'], cadence: ['a cadência', 'plain'], first_date: ['a primeira data', 'date'],
  last_date: ['a última data', 'date'], task_id: ['a tarefa do bloco', 'plain'], distributed: ['a distribuição', 'plain'],
}
const SILENT = new Set(['id', 'done_at', 'sort', 'created_at', 'created_by', 'author_name', 'uploader_name'])
const TASK_STATUS: Record<string, string> = { not_started: 'não iniciada', in_progress: 'em andamento', done: 'concluída' }
const ROLE: Record<string, string> = { don: 'Don', terral: 'Terral' }
const MAX_CLAUSES = 3

const empty = (v: unknown) => v === null || v === undefined || v === ''
const short = (v: unknown, n = 80) => {
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)
/** "de" + article: "o bloco" → "do bloco", "a entrega" → "da entrega". */
const of = (thing: string) => thing.replace(/^o /, 'do ').replace(/^a /, 'da ').replace(/^os /, 'dos ').replace(/^as /, 'das ')

function value(v: unknown, kind: Kind, names: Record<string, string>): string {
  if (kind === 'date' && isDate(v)) return fmtDate(v.slice(0, 10))
  if (kind === 'hours' && typeof v === 'number') return fmtHours(v)
  if (kind === 'person') return names[String(v)] ?? String(v)
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (Array.isArray(v)) return v.join(', ')
  return short(v, 40)
}

/** A generic clause for one changed field ("mudou a data de 12/11 para 19/11"), without the subject. */
function fieldClause(table: string, f: string, a: unknown, b: unknown, names: Record<string, string>): string {
  const def = FIELD[f]
  if (!def) return `alterou ${f} ${THING[table] ? of(THING[table]) : `de ${table}`}`
  const [label, kind] = def
  if (empty(b)) return `limpou ${label}`
  if (kind === 'text') return `mudou ${label} para "${short(b)}"`
  if (empty(a)) return `definiu ${label} como ${value(b, kind, names)}`
  return `mudou ${label} de ${value(a, kind, names)} para ${value(b, kind, names)}`
}

const depText = (d: Obj) => `${d.from_ref ?? '?'} → ${d.to_code ?? '?'}`

/** Clauses for an UPDATE, special cases first; a field handled by a special case is consumed. */
function updateClauses(table: string, o: Obj, n: Obj, names: Record<string, string>): string[] {
  const changed = [...new Set([...Object.keys(o), ...Object.keys(n)])]
    .filter((k) => !SILENT.has(k) && JSON.stringify(o[k] ?? null) !== JSON.stringify(n[k] ?? null))
  const left = new Set(changed)
  const take = (...ks: string[]) => ks.forEach((k) => left.delete(k))
  const out: string[] = []
  const has = (k: string) => left.has(k)
  const who = String(n.display_name ?? o.display_name ?? 'a conta')

  if (has('week') && changed.includes('date')) take('week') // the week follows the date

  if (has('done')) {
    take('done')
    out.push(`${n.done ? 'concluiu' : 'reabriu'} ${THING[table] ?? 'o item'}`)
  }
  if (has('status')) {
    take('status')
    const s = String(n.status ?? '')
    if (table === 'open_item') {
      const what = (n.kind ?? o.kind) === 'divergencia' ? 'a divergência' : 'a pendência'
      out.push(`${s === 'resolved' ? 'resolveu' : 'reabriu'} ${what}`)
    } else if (table === 'decision') {
      if (s === 'decided') {
        take('outcome', 'decided_by', 'decided_at')
        out.push(n.outcome ? `registrou a decisão: "${short(n.outcome)}"` : 'registrou a decisão')
      } else {
        take('outcome', 'decided_by', 'decided_at')
        out.push('voltou a decisão para pendente')
      }
    } else if (table === 'task') {
      out.push(s === 'done' ? 'concluiu a tarefa' : `mudou a situação da tarefa de ${TASK_STATUS[String(o.status)] ?? o.status} para ${TASK_STATUS[s] ?? s}`)
    } else if (table === 'manual_risk') {
      out.push(s === 'closed' ? 'encerrou o risco' : 'reabriu o risco')
    } else if (table === 'profiles') {
      if (s === 'approved' && o.status !== 'blocked') {
        const role = n.role as string | null
        if (has('role')) take('role')
        out.push(`liberou o acesso de ${who}${role ? ` como ${ROLE[role] ?? role}` : ''}`)
      } else if (s === 'approved') out.push(`desbloqueou o acesso de ${who}`)
      else if (s === 'blocked') out.push(`bloqueou o acesso de ${who}`)
      else out.push(`voltou ${who} para aguardando liberação`)
    } else left.add('status')
  }
  if (table === 'profiles') {
    if (has('role')) {
      take('role')
      out.push(o.role && n.role ? `mudou o acesso de ${who} de ${ROLE[String(o.role)] ?? o.role} para ${ROLE[String(n.role)] ?? n.role}` : `mudou o acesso de ${who}`)
    }
    if (has('must_change_password')) {
      take('must_change_password')
      out.push(n.must_change_password ? `gerou uma senha temporária para ${who}` : 'definiu uma nova senha')
    }
    if (has('person_id')) {
      take('person_id')
      out.push(n.person_id ? `ligou ${who} à pessoa ${names[String(n.person_id)] ?? n.person_id}` : `desligou ${who} da pessoa da equipe`)
    }
  }
  if (has('built_at')) {
    take('built_at')
    out.push(!o.built_at ? `marcou como construída em ${value(n.built_at, 'date', names)}` : !n.built_at ? 'desmarcou "Construído"'
      : `mudou a data de construída de ${value(o.built_at, 'date', names)} para ${value(n.built_at, 'date', names)}`)
  }
  if (has('in_use_at')) {
    take('in_use_at')
    out.push(!o.in_use_at ? `marcou em uso em ${value(n.in_use_at, 'date', names)}` : !n.in_use_at ? 'desmarcou "Em uso"'
      : `mudou a data de em uso de ${value(o.in_use_at, 'date', names)} para ${value(n.in_use_at, 'date', names)}`)
  }
  if (has('in_use_confirmed')) {
    take('in_use_confirmed')
    out.push(n.in_use_confirmed ? 'confirmou a data de uso' : 'tirou a confirmação da data de uso')
  }
  if (has('published_flag')) {
    take('published_flag')
    out.push(!n.published_flag ? 'retirou a atenção publicada'
      : !o.published_flag ? `publicou atenção para a Terral: "${short(n.published_flag)}"` : `mudou a atenção publicada para "${short(n.published_flag)}"`)
  }
  if (has('visible_to_terral')) {
    take('visible_to_terral')
    const on = !!n.visible_to_terral
    if (table === 'comment' || table === 'evidence') out.push(on ? `mostrou ${THING[table]} para a Terral` : `ocultou ${THING[table]} da Terral`)
    else out.push(on ? 'deixou visível para a Terral' : 'deixou só para a Don')
  }
  if (has('suggested') && table === 'dependency') {
    take('suggested')
    const d = { ...o, ...n }
    out.push(n.suggested ? `marcou a dependência ${depText(d)} como sugerida` : `confirmou a dependência ${depText(d)}`)
  }

  for (const f of changed) if (left.has(f)) out.push(fieldClause(table, f, o[f], n[f], names))
  return out
}

const join = (xs: string[]) => {
  if (xs.length > MAX_CLAUSES) {
    const more = xs.length - MAX_CLAUSES
    return `${xs.slice(0, MAX_CLAUSES).join(', ')} e mais ${more} ${more === 1 ? 'alteração' : 'alterações'}`
  }
  return xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}` : xs[0]
}

/** "e as horas ...": a second generic clause drops its verb when it repeats ("mudou a data ... e as horas ..."). */
const tidy = (xs: string[]) => xs.map((c, i) => (i > 0 && c.startsWith('mudou ') && xs[i - 1].startsWith('mudou ') ? c.slice(6) : c))

/** "Beto mudou a data de 12/11 para 19/11". `names` maps user ids (and person ids) to display names. */
export function historyText(row: HistoryRow, names: Record<string, string>): string {
  const who = row.user_id ? names[row.user_id] ?? 'Alguém' : 'Sistema'
  const table = row.table_name
  const thing = THING[table]
  const o = obj(row.old)
  const n = obj(row.new)

  if (row.action === 'INSERT') {
    if (table === 'profiles' && n.display_name) return `${short(n.display_name, 60)} se cadastrou`
    if (table === 'block' && n.description) return `${who} criou o bloco "${short(n.description)}"${isDate(n.date) ? ` em ${fmtDate(n.date)}` : ''}`
    if (table === 'task' && n.description) return `${who} criou a tarefa "${short(n.description)}"`
    if (table === 'dependency') return `${who} ${n.suggested ? 'sugeriu' : 'adicionou'} a dependência ${depText(n)}`
    if (table === 'comment') return n.body ? `${who} comentou: "${short(n.body)}"` : `${who} comentou`
    if (table === 'evidence') return n.file_name ? `${who} anexou "${short(n.file_name)}"` : `${who} anexou um arquivo`
    if (table === 'manual_risk' && n.title) return `${who} criou o risco "${short(n.title)}"`
    return thing ? `${who} criou ${thing}` : `${who} criou um registro em ${table}`
  }
  if (row.action === 'DELETE') {
    if (table === 'block' && o.description) return `${who} apagou o bloco "${short(o.description)}"${isDate(o.date) ? ` de ${fmtDate(o.date)}` : ''}`
    if (table === 'task' && o.description) return `${who} apagou a tarefa "${short(o.description)}"`
    if (table === 'dependency' && o.from_ref) return `${who} removeu a dependência ${depText(o)}`
    if (table === 'evidence' && o.file_name) return `${who} removeu o arquivo "${short(o.file_name)}"`
    if (table === 'profiles' && o.display_name) return `${who} apagou a conta de ${short(o.display_name, 60)}`
    return thing ? `${who} apagou ${thing}` : `${who} apagou um registro de ${table}`
  }
  const clauses = tidy(updateClauses(table, o, n, names))
  if (!clauses.length) return thing ? `${who} alterou ${thing}` : `${who} alterou um registro de ${table}`
  return `${who} ${join(clauses)}`
}

/** What the row is about, for the global feed: "Bloco de 12/11 · 3.1 · Montar a base", "Entrega 3.1 · Segmentação". */
export function historyWhere(row: HistoryRow): string {
  const r = { ...obj(row.old), ...obj(row.new) }
  const s = (v: unknown) => short(v, 60)
  switch (row.table_name) {
    case 'block': return [isDate(r.date) ? `Bloco de ${fmtDate(r.date)}` : 'Bloco', r.code, r.description && s(r.description)].filter(Boolean).join(' · ')
    case 'task': return ['Tarefa', r.code, r.description && s(r.description)].filter(Boolean).join(' · ')
    case 'deliverable': return [`Entrega ${row.row_ref}`, r.name && s(r.name)].filter(Boolean).join(' · ')
    case 'open_item': return `${r.kind === 'divergencia' ? 'Divergência' : 'Pendência'} ${row.row_ref}`
    case 'open_item_internal': return `Pendência ${row.row_ref}`
    case 'decision': return [`Decisão ${row.row_ref}`, r.title && s(r.title)].filter(Boolean).join(' · ')
    case 'dependency': return `Dependência ${depText(r)}`
    case 'comment': return `Comentário em ${r.entity_ref ?? '?'}`
    case 'evidence': return `Arquivo em ${r.entity_ref ?? '?'}`
    case 'profiles': return `Acesso · ${r.display_name ? s(r.display_name) : row.row_ref}`
    case 'person': return `Pessoa · ${r.name ?? row.row_ref}`
    case 'manual_risk': return `Risco · ${r.title ? s(r.title) : row.row_ref}`
    case 'traceability': return `Anexo A · ${r.field ? s(r.field) : row.row_ref}`
    case 'to_schedule': case 'to_schedule_plan': return `Agendamento ${r.to_schedule_id ?? row.row_ref}`
    case 'goal': return `Meta · ${r.metric ? s(r.metric) : row.row_ref}`
    default: return `${row.table_name} ${row.row_ref}`
  }
}

/** Tables the feed filters by, with pt-BR names. */
export const HISTORY_TABLES: { value: string; label: string }[] = [
  { value: 'block', label: 'Blocos' }, { value: 'task', label: 'Tarefas' }, { value: 'deliverable', label: 'Entregas' },
  { value: 'dependency', label: 'Dependências' }, { value: 'open_item', label: 'Pendências' }, { value: 'decision', label: 'Decisões' },
  { value: 'manual_risk', label: 'Riscos manuais' }, { value: 'to_schedule', label: 'Agendamentos' }, { value: 'comment', label: 'Comentários' },
  { value: 'evidence', label: 'Arquivos' }, { value: 'traceability', label: 'Anexo A' }, { value: 'person', label: 'Equipe' },
  { value: 'profiles', label: 'Acessos' }, { value: 'goal', label: 'Metas' },
]
