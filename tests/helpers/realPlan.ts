import { readFileSync } from 'node:fs'
import { applyOverrides } from '../../scripts/import/guard'
import { loadRaw, parseWorkbook } from '../../scripts/import/parse'
import type { PlanData } from '../../src/domain/types'

/** The real snapshot as the loader stores it: parsed, then text overrides applied. */
export function realPlan(): PlanData {
  const { warnings: _w, ...r } = parseWorkbook(loadRaw())
  applyOverrides(r, JSON.parse(readFileSync('data/import/overrides.json', 'utf8')))
  return { ...r, manual_risks: [], comments: [], evidence: [] }
}
