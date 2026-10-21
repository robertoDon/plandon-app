import { useState, type ReactNode } from 'react'
import { Card, Check, Empty, LoadBar, Pill, Ring, Segmented, SeverityBar, SEVERITY, Sheet, Timeline, useToast, type Tone } from '.'
import { SessionProvider, useSession } from '../auth/useSession'
import { Comments } from '../shared/Comments'
import { Evidence } from '../shared/Evidence'

// Dev-only gallery (/dev/ui): every primitive in every tone and state. Not in the production build (see main.tsx).

const TONES: Tone[] = ['ok', 'warn', 'bad', 'don', 'mute']
const LONG = 'Validar o plano de execução com a diretoria e nomear os donos de cada frente antes do lançamento interno em Matão'
const JOURNEY = [
  { date: '2026-10-27', label: 'Plano validado', tone: 'don' as const, shape: 'diamond' as const },
  { date: '2026-11-23', label: 'Lançamento interno', tone: 'don' as const },
  { date: '2026-11-25', label: 'Comitê de vendas', tone: 'warn' as const },
  { date: '2026-12-11', label: 'Carteira por representante', tone: 'don' as const },
  { date: '2027-01-08', label: 'Alertas em uso', tone: 'ok' as const },
  { date: '2027-03-09', label: 'Painel de indicadores', tone: 'don' as const },
  { date: '2027-03-25', label: 'Plano 27/28 aprovado', tone: 'bad' as const, shape: 'diamond' as const },
  { date: '2027-04-28', label: 'Encerramento do projeto', tone: 'mute' as const },
  { date: '2027-06-01', label: 'Fora do período', tone: 'mute' as const },
]

const css = `
.dev { max-width: 1180px; margin: 0 auto; padding: 0 40px 80px; display: flex; flex-direction: column; gap: 22px; }
.dev-bar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: center; align-items: center; gap: 12px; padding: 10px 16px;
  background: var(--glass); -webkit-backdrop-filter: blur(20px) saturate(180%); backdrop-filter: blur(20px) saturate(180%); border-bottom: 1px solid var(--line); }
.dev-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.dev-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 22px; }
.dev-task { display: grid; grid-template-columns: 24px 1fr auto; gap: 12px; align-items: center; padding: 11px 12px; border-radius: 12px; background: var(--bg); }
.dev-task .t { font-size: 14px; font-weight: 600; }
.dev-task .d { font-size: 12px; color: var(--ink2); }
.dev-task.done .t { color: var(--ink2); text-decoration: line-through; }
.dev-risk { display: grid; grid-template-columns: 4px 1fr auto; gap: 14px; padding: 14px 0; border-top: 1px solid var(--line); align-items: start; }
.dev-risk:first-child { border-top: 0; }
.dev-phone { width: 375px; max-width: 100%; padding: 16px; background: var(--bg); border-radius: 14px; box-shadow: 0 0 0 1px var(--line); display: flex; flex-direction: column; gap: 16px; }
.dev-btn { min-height: 44px; padding: 0 18px; border: 0; border-radius: 12px; background: var(--ink); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
.dev-btn:active { transform: scale(0.97); }
@media (max-width: 899px) { .dev { padding: 0 16px 80px; } }
`

function Task({ title, sub }: { title: string; sub: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className={done ? 'dev-task done' : 'dev-task'}>
      <Check checked={done} onChange={setDone} label={`Concluir: ${title}`} />
      <div><div className="t">{title}</div><div className="d">{sub}</div></div>
      <span className="caption num">2 h</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Card title={title}>{children}</Card>
}

/** Real Comments and Evidence on the local database, as whoever is signed in (?kind=&ref= pick the entity). */
function SharedDemo() {
  const { profile, loading } = useSession()
  const q = new URLSearchParams(location.search)
  const kind = q.get('kind') ?? 'deliverable'
  const ref = q.get('ref') ?? '3.1'
  if (loading) return <p className="sub">Carregando a sessão…</p>
  if (!profile?.role) return <Card><Empty title="Entre no app para ver comentários e arquivos reais." hint="Esta seção usa a sessão e o banco local." /></Card>
  return (
    <div className="dev-grid">
      <Card title={`Comentários · ${kind} ${ref} · ${profile.role === 'don' ? 'Don' : 'Terral'}`}><Comments entity_kind={kind} entity_ref={ref} canHide /></Card>
      <Card title="Arquivos"><Evidence entity_kind={kind} entity_ref={ref} /></Card>
    </div>
  )
}

export default function DevUi() {
  const toast = useToast()
  const [view, setView] = useState<'terral' | 'don' | 'reuniao'>('terral')
  const [sheet, setSheet] = useState(false)
  const [n, setN] = useState(0)

  return (
    <>
      <style>{css}</style>
      <div className="dev-bar">
        <Segmented label="Escolher visão" value={view} onChange={setView}
          options={[{ value: 'terral', label: 'Terral · Júlio' }, { value: 'don', label: 'Don · Beto' }, { value: 'reuniao', label: 'Reunião' }]} />
      </div>
      <div className="dev">
        <div>
          <div className="eyebrow">Dev · primitivas</div>
          <h1>UI do PlanDon</h1>
          <p className="sub">Cada primitiva em todos os tons e estados. Só aparece em desenvolvimento.</p>
        </div>

        <Card className="dev-health">
          <div className="dev-row" style={{ gap: 26 }}>
            <Ring value={3} total={19} label="entregas" />
            <Ring value={0} total={19} label="entregas" />
            <Ring value={19} total={19} label="entregas" />
            <Ring value={n} total={10} label="tarefas" size={84} />
            <button className="dev-btn" onClick={() => setN((x) => (x + 3) % 11)}>Avançar anel</button>
          </div>
        </Card>

        <div className="dev-grid">
          <Section title="Pills">
            <div className="dev-row">
              <Pill tone="ok">No prazo</Pill><Pill tone="warn">5 dias</Pill><Pill tone="bad">Crítico</Pill><Pill tone="don">Com você</Pill><Pill tone="mute">Baixo</Pill>
            </div>
            <div className="dev-row" style={{ marginTop: 10 }}>{TONES.map((t) => <Pill key={t} tone={t}>{t}</Pill>)}</div>
          </Section>

          <Section title="Segmented">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Segmented label="Período" value={view} onChange={setView}
                options={[{ value: 'terral', label: 'Semana' }, { value: 'don', label: 'Mês' }, { value: 'reuniao', label: 'Projeto' }]} />
              <Segmented label="Longo" value={view} onChange={setView}
                options={[{ value: 'terral', label: 'Visão geral da Terral' }, { value: 'don', label: 'Bastidores da Don' }, { value: 'reuniao', label: 'Modo reunião' }]} />
            </div>
          </Section>
        </div>

        <Card title="A jornada" action={<a href="#jornada">Ver todas as entregas</a>}>
          <Timeline from="2026-10-01" to="2027-04-30" today="2026-10-21" items={JOURNEY} />
        </Card>

        <div className="dev-grid">
          <Section title="Tarefas (Check)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Task title="Extrair e tratar a base de vendas" sub="3.1 Segmentação · com a Terral" />
              <Task title={LONG} sub="Texto longo" />
              <div className="dev-task">
                <Check checked={false} onChange={() => setTimeout(() => toast.show('Não deu para salvar. Tente de novo.', { tone: 'error' }), 300)} label="Sempre falha" />
                <div><div className="t">Falha no servidor</div><div className="d">O pai não aceita: volta sozinho</div></div>
                <span />
              </div>
              <div className="dev-task">
                <Check checked disabled onChange={() => {}} label="Desabilitado" />
                <div><div className="t">Desabilitado</div><div className="d">Sem permissão</div></div>
                <span />
              </div>
            </div>
          </Section>

          <Section title="Carga da semana">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <LoadBar label="David" used={33} cap={40} />
              <LoadBar label="Lucas" used={32} cap={40} />
              <LoadBar label="Beto" used={20} cap={40} />
              <LoadBar label="Excesso" used={46.5} cap={40} />
              <LoadBar label="Zero" used={0} cap={40} />
              <LoadBar used={9} cap={9} />
            </div>
          </Section>
        </div>

        <Card title="Riscos e gargalos" action={<a href="#riscos">Todos</a>}>
          {(['high', 'medium', 'low'] as const).map((s) => (
            <div className="dev-risk" key={s}>
              <SeverityBar severity={s} />
              <div>
                <div className="overline">Automático · dependência</div>
                <div style={{ fontWeight: 600 }}>{s === 'high' ? 'A base de vendas vence hoje e trava 3 entregas' : s === 'medium' ? LONG : 'Quatro entregas sem data de uso'}</div>
                <div className="caption">Sem ela, nenhuma ativação comercial nos três primeiros meses.</div>
              </div>
              <Pill tone={SEVERITY[s].tone}>{SEVERITY[s].label}</Pill>
            </div>
          ))}
        </Card>

        <div className="dev-grid">
          <Section title="Toast e Sheet">
            <div className="dev-row">
              <button className="dev-btn" onClick={() => toast.show('Tarefa concluída.', { undo: () => toast.show('Desfeito.') })}>Toast com Desfazer</button>
              <button className="dev-btn" onClick={() => toast.show('Não deu para salvar. Tente de novo.', { tone: 'error' })}>Toast de erro</button>
              <button className="dev-btn" onClick={() => toast.show(LONG, { ms: 10000 })}>Toast longo</button>
              <button className="dev-btn" onClick={() => setSheet(true)}>Abrir sheet</button>
            </div>
          </Section>
          <Card title="Vazio"><Empty title="Nada pendente" hint="Quando a Terral ou a Don abrirem uma pendência, ela aparece aqui." /></Card>
          <Card><Empty title="Sem título no card" /></Card>
        </div>

        {import.meta.env.DEV && <SessionProvider><SharedDemo /></SessionProvider>}

        <h2>375 px</h2>
        <div className="dev-phone">
          <Segmented label="Visão no telefone" value={view} onChange={setView}
            options={[{ value: 'terral', label: 'Terral' }, { value: 'don', label: 'Don' }, { value: 'reuniao', label: 'Reunião' }]} />
          <Card title="A jornada" action={<a href="#j">Todas</a>}>
            <Timeline from="2026-10-01" to="2027-05-02" today="2026-10-21" items={JOURNEY} />
          </Card>
          <Card title="Saúde"><div className="dev-row"><Ring value={7} total={19} label="entregas" /><Pill tone="warn">Atenção</Pill></div></Card>
          <Card title="Carga"><LoadBar label="David" used={46} cap={40} /></Card>
        </div>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Entrega 3.1 · Segmentação">
        <p className="sub">Side sheet a partir de 900 px, bottom sheet abaixo. Esc, clique fora ou arraste para baixo fecha.</p>
        <button className="dev-btn" style={{ marginTop: 12 }} onClick={() => toast.show('Tarefa concluída.', { undo: () => {} })}>Toast dentro do sheet</button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          <Task title="Calcular potencial e gap por conta" sub="Prazo 11/12" />
          <Task title={LONG} sub="Texto longo" />
        </div>
        {Array.from({ length: 12 }, (_, i) => <p key={i} className="caption">Linha {i + 1} para rolar o corpo do sheet.</p>)}
      </Sheet>
    </>
  )
}
