import type { ISODate } from './dates'

// One row type per table. Field names equal the DB column names (snake_case).

export type Severity = 'high' | 'medium' | 'low'
export type Front = string // 'Gestão' | 'Vendas' | 'Marketing' (taken from the sheet)

export interface Person {
  id: string // lowercased first name: david | lucas | beto
  name: string
  net_capacity_h: number | null
  daily_cap_h: number
  weekly_cap_h: number
}

export interface Deliverable {
  code: string
  name: string
  front: Front
  origin: 'escopo2' | 'instrumento'
  built_date: ISODate | null // planned "Construído" date from the sheet
  in_use_start: ISODate | null
  in_use_end: ISODate | null
  in_use_text: string | null // original sheet text, always kept
  in_use_confirmed: boolean
  built_at: ISODate | null // set by Don in the app
  in_use_at: ISODate | null // set by Don in the app
  target_ritual: string | null
  terral_owner: string | null // a position, never a Don person
  published_flag: string | null
  sort: number
}

// One task = one distinct (code, description) of the Prioridades rows typed "Tarefa" / "Tarefa com a Terral".
// The same task is often split across people; the blocks carry the real person.
// person_id here is the primary owner (most hours in the sheet).
export type TaskKind = 'task' | 'with_terral'
export type TaskStatus = 'not_started' | 'in_progress' | 'done'
export interface Task {
  id: string
  sort: number
  due: ISODate | null
  kind: TaskKind
  front: Front
  code: string
  description: string
  person_id: string | null
  status: TaskStatus
}

export interface Block {
  id: string
  date: ISODate
  week: string // S01..S27
  type: string // Tarefa, Tarefa com a Terral, Rito, Preparação de decisão, Decisão da diretoria, Bloco presencial, ...
  front: Front
  code: string | null
  description: string
  person_id: string | null // null for Diretoria Terral rows
  hours: number
  due: ISODate | null
  task_id: string | null
  done: boolean
  done_at: string | null
}

export interface Ritual {
  id: string
  name: string
  cadence: string
  first_date: ISODate | null
  last_date: ISODate | null
  sort: number
}

export interface RitualOccurrence {
  id: string
  ritual_id: string
  date: ISODate
  week: string
  block_id: string
}

export type DecisionStatus = 'pending' | 'decided'
export interface Decision {
  code: string // D01..D15
  title: string
  date: ISODate | null
  prepared_on: ISODate | null
  status: DecisionStatus
  outcome: string | null
  decided_by: string | null
  decided_at: ISODate | null
}

export interface ToSchedule {
  id: string // "<deliverable code>-<n>"
  code: string
  what: string
  window_start: ISODate | null
  window_end: ISODate | null
  window_text: string | null
  confirmed_date: ISODate | null
}

export interface ToSchedulePlan {
  to_schedule_id: string
  person_id: string | null
  hours: number
  distributed: boolean
}

export type OpenItemKind = 'pendencia' | 'divergencia'
export interface OpenItem {
  code: string // P-xx | X-xx
  kind: OpenItemKind
  text: string
  owner_public: string
  due: ISODate | null
  due_text: string | null // original text when it is not an exact date
  effect: string | null
  status: 'open' | 'resolved'
  visible_to_terral: boolean
}

export interface OpenItemInternal {
  code: string
  owner_raw: string
}

export interface Goal {
  id: string
  sort: number
  level: string
  position: string
  metric: string
  baseline: string | null
  state: string
  target: string | null
}

export interface Traceability {
  id: string
  annex_tab: string
  field: string
  col: string
  n: number
  deliverable_code: string | null
  task_description: string
  filled_by: string
}

export interface Dependency {
  id: string
  from_kind: 'deliverable' | 'decision' | 'open_item' | 'to_schedule'
  from_ref: string
  to_code: string
  suggested: boolean
}

export interface ManualRisk {
  id: string
  title: string
  severity: Severity
  links: string[]
  person_id: string | null
  status: 'open' | 'closed'
  note: string | null
  created_by: string | null
}

export interface Comment {
  id: string
  entity_kind: string
  entity_ref: string
  author_id: string
  author_role: 'don' | 'terral'
  body: string
  visible_to_terral: boolean
  created_at: string
}

export interface Evidence {
  id: string
  entity_kind: string
  entity_ref: string
  storage_path: string
  file_name: string
  uploader_id: string
  uploader_role: 'don' | 'terral'
  visible_to_terral: boolean
  created_at: string
}

export interface HistoryRow {
  id: number
  table_name: string
  row_ref: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  old: unknown
  new: unknown
  user_id: string | null
  at: string
}

export interface Profile {
  id: string
  display_name: string
  role: 'don' | 'terral' | null
  status: 'pending' | 'approved' | 'blocked'
  person_id: string | null
  must_change_password: boolean
}

export interface PlanData {
  people: Person[]
  deliverables: Deliverable[]
  tasks: Task[]
  blocks: Block[]
  rituals: Ritual[]
  ritual_occurrences: RitualOccurrence[]
  decisions: Decision[]
  to_schedule: ToSchedule[]
  to_schedule_plan: ToSchedulePlan[]
  open_items: OpenItem[]
  open_items_internal: OpenItemInternal[]
  goals: Goal[]
  traceability: Traceability[]
  dependencies: Dependency[]
  manual_risks: ManualRisk[]
  comments: Comment[]
  evidence: Evidence[]
}

/** PlanData key -> Postgres table name (singular). */
export const TABLE_OF: Record<keyof PlanData, string> = {
  people: 'person',
  deliverables: 'deliverable',
  tasks: 'task',
  blocks: 'block',
  rituals: 'ritual',
  ritual_occurrences: 'ritual_occurrence',
  decisions: 'decision',
  to_schedule: 'to_schedule',
  to_schedule_plan: 'to_schedule_plan',
  open_items: 'open_item',
  open_items_internal: 'open_item_internal',
  goals: 'goal',
  traceability: 'traceability',
  dependencies: 'dependency',
  manual_risks: 'manual_risk',
  comments: 'comment',
  evidence: 'evidence',
}
