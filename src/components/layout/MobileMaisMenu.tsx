import { NavLink } from 'react-router-dom'
import {
  Bike,
  Wallet,
  Package,
  CalendarDays,
  Settings,
  Shield,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/context/AuthContext'
import { useAssinatura } from '@/context/AssinaturaContext'
import { podeAcessarModuloComPlano } from '@/services/assinatura/plano-features'
import type { ModuloCraft } from '@/services/auth/permissions'
import { ehAdminSistema } from '@/lib/craft-admin'

const itensMais: {
  to: string
  label: string
  icone: typeof Bike
  modulo: ModuloCraft
  adminOnly?: boolean
}[] = [
  { to: '/motos', label: 'Motos', icone: Bike, modulo: 'motos' },
  { to: '/financeiro', label: 'Financeiro', icone: Wallet, modulo: 'financeiro' },
  { to: '/estoque', label: 'Estoque', icone: Package, modulo: 'estoque' },
  { to: '/agenda', label: 'Agenda', icone: CalendarDays, modulo: 'agenda' },
  { to: '/configuracoes', label: 'Configurações', icone: Settings, modulo: 'configuracoes' },
  {
    to: '/admin-craft',
    label: 'Admin BoxGestor',
    icone: Shield,
    modulo: 'admin_craft',
    adminOnly: true,
  },
]

interface MobileMaisMenuProps {
  aberto: boolean
  onFechar: () => void
}

export function MobileMaisMenu({ aberto, onFechar }: MobileMaisMenuProps) {
  const { session } = useAuth()
  const { plano } = useAssinatura()

  const itensVisiveis = itensMais.filter((item) => {
    if (!session?.user) return false
    if (item.adminOnly) return ehAdminSistema(session.user)
    return podeAcessarModuloComPlano(session.user.papel, plano, item.modulo)
  })

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-lg:rounded-t-2xl max-lg:pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <DialogHeader>
          <DialogTitle>Mais opções</DialogTitle>
        </DialogHeader>
        <nav className="grid gap-2 py-2">
          {itensVisiveis.map(({ to, label, icone: Icone }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onFechar}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[3rem] items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted/30 text-foreground hover:bg-muted/50'
                )
              }
            >
              <Icone className="h-5 w-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <Button variant="ghost" className="mt-2 w-full gap-2 lg:hidden" onClick={onFechar}>
          <X className="h-4 w-4" />
          Fechar
        </Button>
      </DialogContent>
    </Dialog>
  )
}
