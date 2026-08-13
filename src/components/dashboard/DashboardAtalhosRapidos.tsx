import { Link } from 'react-router-dom'
import { UserPlus, ClipboardPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useOficinaData } from '@/context/CraftContext'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import { getIconeVeiculo } from '@/lib/termos-oficina'
import { cn } from '@/lib/utils'
import {
  podeCriarCliente,
  podeCriarOS,
  podeCriarVeiculo,
} from '@/services/auth/permissions'

const ICONE_CHIP = [
  'bg-sky-500/15 text-sky-400',
  'bg-violet-500/15 text-violet-400',
  'bg-blue-500/15 text-blue-400',
] as const

export function DashboardAtalhosRapidos() {
  const { session } = useAuth()
  const { configuracao } = useOficinaData()
  const termos = useTermosOficina()
  const IconeVeiculo = getIconeVeiculo(termos.tipo)
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
      icone: IconeVeiculo,
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
    <div className="flex min-w-0 flex-wrap gap-2">
      {atalhos.map(({ to, label, icone: Icone }, i) => (
        <Button
          key={to}
          variant="outline"
          size="sm"
          className="h-9 gap-2 border-zinc-700/50 bg-zinc-900/90 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50"
          asChild
        >
          <Link to={to}>
            <span
              className={cn(
                'inline-flex rounded-md p-1',
                ICONE_CHIP[i % ICONE_CHIP.length]
              )}
            >
              <Icone className="h-3.5 w-3.5" />
            </span>
            {label}
          </Link>
        </Button>
      ))}
    </div>
  )
}
