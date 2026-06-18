import { Link } from 'react-router-dom'
import {
  UserPlus,
  Bike,
  ClipboardPlus,
  Bell,
  ClipboardList,
  Wallet,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const atalhosDesktop = [
  { to: '/clientes', label: 'Novo cliente', icone: UserPlus },
  { to: '/motos', label: 'Nova moto', icone: Bike },
  { to: '/ordens-servico?novo=1', label: 'Nova OS', icone: ClipboardPlus },
] as const

const atalhosMobile = [
  { to: '/ordens-servico?novo=1', label: 'Nova OS', icone: ClipboardPlus },
  { to: '/clientes', label: 'Clientes', icone: Users },
  { to: '/motos', label: 'Motos', icone: Bike },
  { to: '/lembretes', label: 'Lembretes', icone: Bell },
  { to: '/ordens-servico?status=em_andamento', label: 'OS andamento', icone: ClipboardList },
  { to: '/financeiro', label: 'Pagamentos', icone: Wallet },
] as const

export function DashboardAtalhosRapidos() {
  return (
    <>
      <div className="hidden flex-wrap gap-2 md:flex">
        {atalhosDesktop.map(({ to, label, icone: Icone }) => (
          <Button key={to} variant="outline" size="sm" className="gap-2" asChild>
            <Link to={to}>
              <Icone className="h-4 w-4" />
              {label}
            </Link>
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:hidden">
        {atalhosMobile.map(({ to, label, icone: Icone }) => (
          <Button
            key={to}
            variant="outline"
            size="lg"
            className="h-auto min-h-[4rem] flex-col gap-1.5 py-3 text-xs"
            asChild
          >
            <Link to={to}>
              <Icone className="h-5 w-5" />
              {label}
            </Link>
          </Button>
        ))}
      </div>
    </>
  )
}
