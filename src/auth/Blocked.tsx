import { signOut } from './useSession'
import { AuthCard } from './AuthCard'

export default function Blocked() {
  return (
    <AuthCard title="Acesso bloqueado" sub="Esta conta não tem acesso ao PlanDon agora. Se achar que é um engano, fale com a equipe Don.">
      <div className="auth-status bad">Bloqueado</div>
      <button type="button" className="btn-secondary" onClick={() => void signOut()}>Sair</button>
    </AuthCard>
  )
}
