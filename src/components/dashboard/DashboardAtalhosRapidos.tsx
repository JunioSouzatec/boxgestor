import { Link } from 'react-router-dom'
import { UserPlus, Bike, ClipboardPlus, Package, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const atalhos = [
  { to: '/clientes', label: 'Novo cliente', icone: UserPlus },
  { to: '/motos', label: 'Nova moto', icone: Bike },
  { to: '/ordens-servico?novo=1', label: 'Nova OS', icone: ClipboardPlus },
  { to: '/estoque', label: 'Estoque', icone: Package },
  { to: '/relatorios', label: 'Relatórios', icone: BarChart3 },
] as const

export function DashboardAtalhosRapidos() {
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
