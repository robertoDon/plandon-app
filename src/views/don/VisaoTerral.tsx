import { Navigate, NavLink, Route, Routes } from 'react-router'
import { Icon } from '../../app/icons'
import { ROUTES } from '../../app/routes'
import { TerralCtx } from '../../terral/Page'
import { Overview } from '../../terral/Overview'
import { Milestones } from '../../terral/Milestones'
import { Deliverables } from '../../terral/Deliverables'
import { DeliverableDetail } from '../../terral/DeliverableDetail'
import { Decisions } from '../../terral/Decisions'
import { Goals } from '../../terral/Goals'

const BASE = '/don/terral'
const PREVIEW = { base: BASE, preview: true }
// Terral's own sections, as its sidebar lists them, moved under the preview.
const TABS = ROUTES.filter((r) => r.area === 'terral' && r.nav).map((r) => ({ to: r.path.replace(/^\/t/, BASE), label: r.title, end: !!r.nav?.end }))

/**
 * Don's "Visão da Terral": the very components Terral mounts, on the plan projected as Terral reads it
 * (useTerralData gives Don toTerralData of the plan). Every write is off: Don must not act as Terral.
 */
export default function VisaoTerral() {
  return (
    <TerralCtx.Provider value={PREVIEW}>
      <div className="t-preview">
        <p className="t-banner" role="note">
          <Icon name="eye" size={18} />
          <span><b>Visão da Terral</b> — é assim que eles veem. Registrar, confirmar e comentar ficam desligados.</span>
        </p>
        <nav className="t-subnav" aria-label="Seções da Visão da Terral">
          {TABS.map((t) => <NavLink key={t.to} to={t.to} end={t.end}>{t.label}</NavLink>)}
        </nav>
      </div>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="marcos" element={<Milestones />} />
        <Route path="entregas" element={<Deliverables />} />
        <Route path="entregas/:code" element={<DeliverableDetail />} />
        <Route path="decisoes" element={<Decisions />} />
        <Route path="metas" element={<Goals />} />
        <Route path="*" element={<Navigate to={BASE} replace />} />
      </Routes>
    </TerralCtx.Provider>
  )
}
