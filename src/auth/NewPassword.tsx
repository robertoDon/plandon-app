import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { signOut, useSession } from './useSession'
import { AuthCard, Field, FormError, MIN_PASSWORD, Submit, useSubmit } from './AuthCard'

/** After a temporary password: the person picks their own, then the flag is cleared and the guard lets them in. */
export default function NewPassword() {
  const { refresh } = useSession()
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [tried, setTried] = useState(false)
  const { busy, error, submit } = useSubmit()

  const errors = {
    password: password.length < MIN_PASSWORD ? `Use pelo menos ${MIN_PASSWORD} caracteres.` : undefined,
    again: again !== password ? 'As senhas não são iguais.' : undefined,
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (errors.password || errors.again) return
    void submit(async () => {
      const up = await supabase.auth.updateUser({ password })
      if (up.error) return up.error.code === 'same_password' ? 'Escolha uma senha diferente da temporária.' : 'Não deu para trocar a senha. Tente de novo.'
      const rpc = await supabase.rpc('clear_must_change_password')
      if (rpc.error) return 'A senha mudou, mas não deu para concluir. Tente de novo.'
      await refresh()
    })
  }

  return (
    <AuthCard title="Escolha uma senha nova" sub="Você entrou com uma senha temporária. Defina a sua para continuar."
      footer={<button type="button" className="auth-link" onClick={() => void signOut()}>Sair</button>}>
      <form onSubmit={onSubmit} noValidate>
        <Field label="Nova senha" type="password" autoComplete="new-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} error={tried ? errors.password : undefined} hint={`Pelo menos ${MIN_PASSWORD} caracteres.`} />
        <Field label="Repita a senha" type="password" autoComplete="new-password" required value={again}
          onChange={(e) => setAgain(e.target.value)} error={tried ? errors.again : undefined} />
        <FormError>{error}</FormError>
        <Submit busy={busy} busyText="Salvando…">Salvar e continuar</Submit>
      </form>
    </AuthCard>
  )
}
