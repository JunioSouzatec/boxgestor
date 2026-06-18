import { Link } from 'react-router-dom'
import { UserPlus, Bike, ClipboardPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

const atalhosDesktop = [
  { to: '/clientes', label: 'Novo cliente', icone: UserPlus },
  { to: '/motos', label: 'Nova moto', icone: Bike },
  { to: '/ordens-servico?novo=1', label: 'Nova OS', icone: ClipboardPlus },
] as const

export function DashboardAtalhosRapidos() {
  return (
    <div className="flex flex-wrap gap-2">
      {atalhosDesktop.map(({ to, label, icone: Icone }) => (
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
