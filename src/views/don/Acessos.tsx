import { useState, type FormEvent } from 'react'
import { useSession } from '../../auth/useSession'
import { supabase } from '../../lib/supabase'
import { usePlanData, useMutate, type DonData } from '../../lib/data'
import type { Profile } from '../../domain/types'
import { Card, Pill, Segmented, Sheet } from '../../ui'
import { DonPage } from '../../don/Page'
import { FormActions, SelectField } from '../../don/fields'
import '../../shared/shared.css'

// No 0/O/o, 1/l/I: the password is read aloud or typed from a screen.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/** A random temporary password from crypto.getRandomValues: 14 characters, ~80 bits, no modulo bias. */
export function tempPassword(length = 14): string {
  const limit = 256 - (256 % ALPHABET.length)
  const out: string[] = []
  const buf = new Uint8Array(32)
  while (out.length < length) {
    crypto.getRandomValues(buf)
    for (const b of buf) if (b < limit && out.length < length) out.push(ALPHABET[b % ALPHABET.length])
  }
  return out.join('')
}

/** pt-BR message for a set-temp-password failure (see supabase/functions/set-temp-password/handler.ts). */
function passwordError(e: unknown): string {
  const err = e as { name?: string; context?: { status?: number } }
  const status = err?.context?.status
  if (status === 401) return 'Sua sessão expirou. Entre de novo e tente outra vez.'
  if (status === 403) return 'Só a equipe Don com acesso liberado pode gerar senhas.'
  if (status === 404) return 'Essa conta não existe mais.'
  if (status === 400) return 'A senha não foi aceita. Tente de novo.'
  if (err?.name === 'FunctionsFetchError' || e instanceof TypeError) return 'Sem conexão. Tente de novo.'
  return 'Não deu para gerar a senha. Tente de novo.'
}

type Patch = Partial<Pick<Profile, 'role' | 'status' | 'person_id'>>
type Write = { update: Patch; match: { id: string } }

type Mode =
  | { kind: 'manage'; id: string }
  | { kind: 'approveDon'; id: string }
  | { kind: 'block'; id: string; back: boolean }
  | { kind: 'role'; id: string; role: 'don' | 'terral'; person: string }
  | { kind: 'password'; id: string; password: string }

const ROLE_LABEL = { don: 'Don', terral: 'Terral' } as const
const byName = (a: Profile, b: Profile) => a.display_name.localeCompare(b.display_name, 'pt-BR')
const isPending = (p: Profile) => p.status === 'pending' || (p.status === 'approved' && !p.role)

/**
 * Don: who may use the app. Pending sign-ups are approved as Terral (one tap) or as Don (with the person they are);
 * approved accounts change role, get a temporary password, or are blocked. Blocking and role changes ask first:
 * the only confirmation in the app. The signed-in Don cannot block, demote or reset themselves.
 */
export default function Acessos() {
  const state = usePlanData()
  const { profile: me } = useSession()
  const write = useMutate<Write>('profiles', {
    optimistic: (old, w) => ({ ...old, profiles: old.profiles.map((p) => (p.id === w.match.id ? { ...p, ...w.update } : p)) }),
  })
  const [mode, setMode] = useState<Mode | null>(null)
  const [open, setOpen] = useState(false)
  const show = (m: Mode) => { setMode(m); setOpen(true) }
  const close = () => setOpen(false)
  const save = (id: string, update: Patch) => {
    if (id === me?.id && (update.role !== undefined || update.status !== undefined)) return // never lock yourself out
    write.mutate({ update, match: { id } })
  }

  return (
    <DonPage eyebrow="Administração" title="Acessos" state={state}
      sub={(d) => {
        const waiting = d.profiles.filter(isPending).length
        return `${waiting} aguardando · ${d.profiles.filter((p) => p.status === 'approved' && p.role).length} com acesso.`
      }}>
      {(d) => {
        const pending = d.profiles.filter(isPending).sort(byName)
        const approved = d.profiles.filter((p) => p.status === 'approved' && p.role).sort(byName)
        const blocked = d.profiles.filter((p) => p.status === 'blocked').sort(byName)
        const person = (id: string | null) => d.people.find((x) => x.id === id)?.name
        const target = mode ? d.profiles.find((p) => p.id === mode.id) : undefined
        return (
          <>
            <Card title="Aguardando liberação">
              {pending.length ? (
                <ul className="don-list" aria-label="Aguardando liberação">
                  {pending.map((p) => (
                    <li key={p.id} className="ac-row many">
                      <span className="ac-who"><b>{p.display_name}</b><span>Cadastro novo</span></span>
                      <span className="ac-acts">
                        <button type="button" className="dbtn small primary" onClick={() => save(p.id, { role: 'terral', status: 'approved', person_id: null })}>Liberar como Terral</button>
                        <button type="button" className="dbtn small" onClick={() => show({ kind: 'approveDon', id: p.id })}>Liberar como Don</button>
                        <button type="button" className="dbtn small danger" onClick={() => show({ kind: 'block', id: p.id, back: false })}>Recusar</button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="don-quiet">Ninguém aguardando. Quem se cadastrar aparece aqui na hora.</p>}
            </Card>

            <Card title="Com acesso">
              <ul className="don-list" aria-label="Com acesso">
                {approved.map((p) => (
                  <li key={p.id} className="ac-row">
                    <span className="ac-who">
                      <b>{p.display_name}</b>
                      <span>
                        <Pill tone={p.role === 'don' ? 'don' : 'ok'}>{ROLE_LABEL[p.role!]}</Pill>
                        {p.role === 'don' && person(p.person_id) && <span>{person(p.person_id)}</span>}
                        {p.id === me?.id && <Pill tone="mute">Você</Pill>}
                        {p.must_change_password && <Pill tone="warn">Senha temporária</Pill>}
                      </span>
                    </span>
                    <span className="ac-acts">
                      <button type="button" className="dbtn small" aria-label={`Gerenciar ${p.display_name}`} onClick={() => show({ kind: 'manage', id: p.id })}>Gerenciar</button>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            {blocked.length > 0 && (
              <Card title="Bloqueados">
                <ul className="don-list" aria-label="Bloqueados">
                  {blocked.map((p) => (
                    <li key={p.id} className="ac-row">
                      <span className="ac-who"><b>{p.display_name}</b><span>{p.role ? `Era ${ROLE_LABEL[p.role]}` : 'Cadastro recusado'}</span></span>
                      <span className="ac-acts">
                        <button type="button" className="dbtn small" onClick={() => save(p.id, { status: p.role ? 'approved' : 'pending' })}>Desbloquear</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Sheet open={open} onClose={close} onClosed={() => setMode(null)} title={mode && target ? sheetTitle(mode, target) : ''}>
              {mode && target && (
                <SheetBody key={`${mode.kind}-${mode.id}`} mode={mode} target={target} self={target.id === me?.id} data={d}
                  onMode={show} onClose={close} save={save} />
              )}
            </Sheet>
          </>
        )
      }}
    </DonPage>
  )
}

function sheetTitle(mode: Mode, p: Profile): string {
  switch (mode.kind) {
    case 'manage': return p.display_name
    case 'approveDon': return `Liberar ${p.display_name} como Don`
    case 'block': return isPending(p) ? `Recusar ${p.display_name}?` : `Bloquear ${p.display_name}?`
    case 'role': return `Mudar o papel de ${p.display_name}?`
    case 'password': return 'Senha temporária'
  }
}

function SheetBody({ mode, target: p, self, data, onMode, onClose, save }: {
  mode: Mode; target: Profile; self: boolean; data: DonData
  onMode: (m: Mode) => void; onClose: () => void; save: (id: string, u: Patch) => void
}) {
  const people = [{ value: '', label: 'Nenhuma' }, ...data.people.map((x) => ({ value: x.id, label: x.name }))]
  const [role, setRole] = useState<'don' | 'terral'>(p.role ?? 'terral')
  const [person, setPerson] = useState(p.person_id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)

  if (mode.kind === 'approveDon') {
    const submit = (e: FormEvent) => {
      e.preventDefault()
      save(p.id, { role: 'don', status: 'approved', person_id: person || null })
      onClose()
    }
    return (
      <form className="dform" onSubmit={submit}>
        <p className="dnote">{p.display_name} passa a ver tudo da Don: horas, pessoas, riscos e pendências internas.</p>
        <SelectField label="Pessoa da equipe" value={person} onChange={setPerson} options={people} />
        <FormActions onCancel={onClose} save="Liberar" />
      </form>
    )
  }

  if (mode.kind === 'block') {
    const cancel = () => (mode.back ? onMode({ kind: 'manage', id: p.id }) : onClose())
    return (
      <div className="dform">
        <p className="dnote">
          {isPending(p)
            ? `${p.display_name} não entra no app. Dá para desbloquear depois, em Bloqueados.`
            : `${p.display_name} perde o acesso na hora, em qualquer aparelho. Dá para desbloquear depois.`}
        </p>
        <div className="dform-actions">
          <button type="button" className="dbtn" onClick={cancel}>Cancelar</button>
          <button type="button" className="dbtn danger solid" onClick={() => { save(p.id, { status: 'blocked' }); onClose() }}>
            {isPending(p) ? 'Recusar' : 'Bloquear'}
          </button>
        </div>
      </div>
    )
  }

  if (mode.kind === 'role') {
    return (
      <div className="dform">
        <p className="dnote">
          {mode.role === 'don'
            ? `${p.display_name} passa a ver tudo da Don: horas, pessoas, riscos e pendências internas.`
            : `${p.display_name} passa a ver só o que a Terral vê.`}
        </p>
        <div className="dform-actions">
          <button type="button" className="dbtn" onClick={() => onMode({ kind: 'manage', id: p.id })}>Cancelar</button>
          <button type="button" className="dbtn primary" onClick={() => {
            save(p.id, { role: mode.role, person_id: mode.role === 'don' ? mode.person || null : null })
            onClose()
          }}>Mudar papel</button>
        </div>
      </div>
    )
  }

  if (mode.kind === 'password') {
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(mode.password)
        setCopied('ok')
      } catch {
        setCopied('fail')
      }
    }
    return (
      <div className="dform">
        <p className="ac-warn" role="status">Copie agora: esta senha não aparece de novo.</p>
        <p className="ac-pass">{mode.password}</p>
        <button type="button" className="dbtn primary" onClick={() => void copy()}>{copied === 'ok' ? 'Copiada' : 'Copiar senha'}</button>
        {copied === 'fail' && <p className="dfield-error" role="alert">Não deu para copiar. Selecione a senha acima e copie.</p>}
        <p className="dnote">Passe a senha para {p.display_name} por um canal seguro. No próximo login, {p.display_name} cria uma senha nova.</p>
        <div className="dform-actions"><button type="button" className="dbtn" onClick={onClose}>Pronto</button></div>
      </div>
    )
  }

  // manage
  const changedRole = role !== p.role
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (changedRole) return onMode({ kind: 'role', id: p.id, role, person })
    if ((person || null) !== p.person_id) save(p.id, { person_id: person || null })
    onClose()
  }
  const generate = async () => {
    setBusy(true)
    setError(null)
    const password = tempPassword()
    try {
      const { error: err } = await supabase.functions.invoke('set-temp-password', { body: { user_id: p.id, password } })
      if (err) return setError(passwordError(err))
      onMode({ kind: 'password', id: p.id, password })
    } catch (e) {
      setError(passwordError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="dform" onSubmit={submit}>
      {self ? (
        <p className="dnote">Você é {ROLE_LABEL[p.role!]}. Você não pode mudar o próprio papel nem bloquear a própria conta.</p>
      ) : (
        <div className="dform-group">
          <span className="caption" aria-hidden="true">Papel</span>
          <Segmented label="Papel" value={role} onChange={setRole} options={[{ value: 'don', label: 'Don' }, { value: 'terral', label: 'Terral' }]} />
        </div>
      )}
      {role === 'don' && <SelectField label="Pessoa da equipe" value={person} onChange={setPerson} options={people} />}
      <FormActions onCancel={onClose} />

      {!self && (
        <>
          <section className="ac-section" aria-label="Senha">
            <p className="dnote">Esqueceu a senha? Gere uma temporária. A senha atual deixa de valer e, no próximo login, {p.display_name} cria uma nova.</p>
            {error && <p className="dform-error" role="alert">{error}</p>}
            <button type="button" className="dbtn" disabled={busy} onClick={() => void generate()}>{busy ? 'Gerando…' : 'Gerar senha temporária'}</button>
          </section>
          <section className="ac-section" aria-label="Bloqueio">
            <button type="button" className="dbtn danger" onClick={() => onMode({ kind: 'block', id: p.id, back: true })}>Bloquear acesso</button>
          </section>
        </>
      )}
    </form>
  )
}
