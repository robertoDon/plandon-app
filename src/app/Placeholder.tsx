import { Link } from 'react-router'
import { useSession } from '../auth/useSession'
import { usePlanData, useTerralData } from '../lib/data'
import { HOME } from './routes'

/** Stand-in for a view whose file under src/views does not exist yet (T9–T13 add them). */
export function Placeholder({ title, fullscreen = false }: { title: string; fullscreen?: boolean }) {
  const { profile } = useSession()
  return (
    <div className={fullscreen ? 'placeholder placeholder-full' : 'placeholder'}>
      <div className="eyebrow">Em construção</div>
      <h1>{title}</h1>
      <p className="sub">Esta tela chega nas próximas etapas.</p>
      {profile?.role === 'don' && !fullscreen ? <DonProbe /> : <TerralProbe /> /* meeting mode: Terral-safe data only */}
      {fullscreen && profile?.role && <Link className="placeholder-back" to={HOME[profile.role]}>Voltar</Link>}
    </div>
  )
}

const n = (x: unknown[] | undefined) => x?.length ?? 0

function Probe({ status, items }: { status: 'pending' | 'error' | 'success'; items: [string, number][] }) {
  return (
    <div className="placeholder-card">
      {status === 'pending' && <span className="caption">Carregando os dados…</span>}
      {status === 'error' && <span className="caption">Não deu para carregar os dados.</span>}
      {status === 'success' && items.map(([label, v]) => <span key={label}><b className="num">{v}</b> {label}</span>)}
    </div>
  )
}

function DonProbe() {
  const { data, status } = usePlanData()
  return <Probe status={status} items={[['entregas', n(data?.deliverables)], ['tarefas', n(data?.tasks)], ['blocos', n(data?.blocks)], ['pendências', n(data?.open_items)], ['contas', n(data?.profiles)]]} />
}

function TerralProbe() {
  const { data, status } = useTerralData()
  return <Probe status={status} items={[['entregas', n(data?.deliverables)], ['decisões', n(data?.decisions)], ['pendências visíveis', n(data?.open_items)], ['metas', n(data?.goals)]]} />
}
