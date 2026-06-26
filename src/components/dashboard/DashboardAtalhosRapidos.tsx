import { Link } from 'react-router-dom'
import { UserPlus, Bike, ClipboardPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useOficinaData } from '@/context/CraftContext'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import {
  podeCriarCliente,
  podeCriarOS,
  podeCriarVeiculo,
} from '@/services/auth/permissions'

export function DashboardAtalhosRapidos() {
  const { session } = useAuth()
  const { configuracao } = useOficinaData()
  const termos = useTermosOficina()
  const user = session?.user

  const atalhos = [
    podeCriarCliente(user, configuracao) && {
      to: '/clientes',
      label: 'Novo cliente',
      icone: UserPlus,
    },
    podeCriarVeiculo(user, configuracao) && {
      to: '/motos',
      label: termos.novoVeiculo,
      icone: Bike,
    },
    podeCriarOS(user, configuracao) && {
      to: '/ordens-servico?novo=1',
      label: 'Nova OS',
      icone: ClipboardPlus,
    },
  ].filter(Boolean) as {
    to: string
    label: string
    icone: typeof UserPlus
  }[]

  if (atalhos.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {atalhos.map(({ to, label, icone: Icone }) => (
        <Button key={to} variant="outline" size="sm" className="gap-2" asChild>
          <Link to={to}>
            <Icone className="h-4 w-4" />
            {label}
          </Link>
        </Button>
      ))}
    </div>
  )
}
