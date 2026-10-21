import { useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { AuthCard, Field, FormError, MIN_PASSWORD, Submit, useSubmit } from './AuthCard'
import { isReservedName } from './reservedName'

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tried, setTried] = useState(false)
  const { busy, error, submit } = useSubmit()

  const errors = {
    name: !name.trim() ? 'Diga como quer ser chamado.' : isReservedName(name) ? 'Esse nome é reservado. Use o seu nome.' : undefined,
    email: !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Confira o e-mail.' : undefined,
    password: password.length < MIN_PASSWORD ? `Use pelo menos ${MIN_PASSWORD} caracteres.` : undefined,
  }
  const show = (k: keyof typeof errors) => (tried ? errors[k] : undefined)

  // Sign-up opens a session at once (no e-mail confirmation); the guard then shows "aguardando liberação".
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    void submit(async () => {
      const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() } } })
      if (!error) return
      if (error.code === 'user_already_exists') return 'Já existe uma conta com esse e-mail. Entre com a sua senha.'
      if (error.code === 'weak_password') return `Senha fraca. Use pelo menos ${MIN_PASSWORD} caracteres.`
      return 'Não deu para criar a conta agora. Tente de novo.'
    })
  }

  return (
    <AuthCard title="Criar conta" sub="Depois do cadastro, a equipe Don libera o seu acesso."
      footer={<>Já tem conta? <Link to="/login">Entrar</Link></>}>
      <form onSubmit={onSubmit} noValidate>
        <Field label="Nome" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} error={show('name')} />
        <Field label="E-mail" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={show('email')} />
        <Field label="Senha" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)}
          error={show('password')} hint={`Pelo menos ${MIN_PASSWORD} caracteres.`} />
        <FormError>{error}</FormError>
        <Submit busy={busy} busyText="Criando…">Criar conta</Submit>
      </form>
    </AuthCard>
  )
}
