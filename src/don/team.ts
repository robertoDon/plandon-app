import { fmtHours } from '../domain/dates'
import { slackOf } from '../domain/risk'
import type { Block, Person, ToSchedulePlan } from '../domain/types'

/** Hours with one decimal ("25,8 h"): the Equipe screen reads at that grain. */
export const fmtHours1 = (h: number) => fmtHours(Math.round(h * 10) / 10)

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

/** One person's load: planned (all blocks), done, still to schedule, and the slack that is left. */
export function teamRow(p: Person, blocks: Block[], plans: ToSchedulePlan[]) {
  const mine = blocks.filter((b) => b.person_id === p.id)
  return {
    planned: sum(mine.map((b) => b.hours)),
    done: sum(mine.filter((b) => b.done).map((b) => b.hours)),
    toSchedule: sum(plans.filter((x) => x.person_id === p.id && !x.distributed).map((x) => x.hours)),
    slack: slackOf(p, blocks, plans),
  }
}
