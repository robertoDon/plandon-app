import { signOut, useSession } from './useSession'
import { AuthCard } from './AuthCard'

export default function Pending() {
  const { profile } = useSession()
  const first = profile?.display_name.split(/\s+/)[0]
  return (
    <AuthCard title={first ? `Tudo certo, ${first}.` : 'Tudo certo.'}
      sub="Sua conta foi criada. Alguém da equipe Don vai liberar o seu acesso. Esta tela muda sozinha quando isso acontecer.">
      <div className="auth-status wait">Aguardando liberação</div>
      <button type="button" className="btn-secondary" onClick={() => void signOut()}>Sair</button>
    </AuthCard>
  )
}
