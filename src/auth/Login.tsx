import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { AuthCard, Field, FormError, Submit, useSubmit } from './AuthCard'

// A one-time message for the next login screen. A module value, not router state: the session guard's own
// redirect to /login (after a sign-out) would drop router state.
let notice: string | null = null
export const setLoginNotice = (msg: string) => { notice = msg }

export default function Login() {
  const [shown] = useState(() => notice) // read in render, cleared after mount (StrictMode calls initializers twice)
  useEffect(() => { notice = null }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [help, setHelp] = useState(false)
  const { busy, error, submit } = useSubmit()

  // On success the session changes and the router guard takes the person to their home.
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void submit(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (!error) return
      return error.status === 400 ? 'E-mail ou senha incorretos.' : 'Não deu para entrar agora. Tente de novo.'
    })
  }

  return (
    <AuthCard title="Entrar" sub="O plano de execução da estrutura comercial."
      footer={<>Primeira vez aqui? <Link to="/cadastro">Criar conta</Link></>}>
      {shown && <p className="auth-help" role="status">{shown}</p>}
      <form onSubmit={onSubmit} noValidate>
        <Field label="E-mail" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Senha" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError>{error}</FormError>
        <Submit busy={busy} busyText="Entrando…">Entrar</Submit>
      </form>
      <button type="button" className="auth-link" aria-expanded={help} onClick={() => setHelp(!help)}>Esqueci a senha</button>
      {help && (
        <p className="auth-help">
          Peça a alguém da equipe Don para definir uma senha temporária para você. No próximo acesso, você escolhe uma senha nova.
        </p>
      )}
    </AuthCard>
  )
}
