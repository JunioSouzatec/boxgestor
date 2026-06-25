import { NavLink } from 'react-router-dom'
import {
  Bike,
  Wallet,
  Package,
  CalendarDays,
  Settings,
  Shield,
  BarChart3,
  Truck,
  UserCog,
  CreditCard,
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
import { podeAcessarModuloComPlano, temRecursoComAssinatura } from '@/services/assinatura/plano-features'
import { podeAcessarModuloUsuario } from '@/services/auth/permissions'
import { useOficinaData } from '@/context/CraftContext'
import type { ModuloCraft } from '@/services/auth/permissions'
import { ehAdminSistema } from '@/lib/craft-admin'
import { useTermosOficina } from '@/hooks/useTermosOficina'

/** Rotas secundárias — acessíveis via "Mais" no mobile/tablet (não duplicam a barra inferior). */
export const ROTAS_MENU_MAIS = [
  '/relatorios',
  '/financeiro',
  '/motos',
  '/estoque',
  '/agenda',
  '/fornecedores',
  '/usuarios',
  '/planos',
  '/configuracoes',
  '/admin-craft',
] as const

const itensMais: {
  to: string
  label: string
  icone: typeof Bike
  modulo: ModuloCraft
  adminOnly?: boolean
}[] = [
  { to: '/relatorios', label: 'Relatórios', icone: BarChart3, modulo: 'relatorios' },
  { to: '/financeiro', label: 'Financeiro', icone: Wallet, modulo: 'financeiro' },
  { to: '/motos', label: 'Motos', icone: Bike, modulo: 'motos' },
  { to: '/estoque', label: 'Estoque', icone: Package, modulo: 'estoque' },
  { to: '/agenda', label: 'Agenda', icone: CalendarDays, modulo: 'agenda' },
  { to: '/fornecedores', label: 'Fornecedores', icone: Truck, modulo: 'fornecedores' },
  { to: '/usuarios', label: 'Usuários', icone: UserCog, modulo: 'usuarios' },
  { to: '/planos', label: 'Planos', icone: CreditCard, modulo: 'planos' },
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
  const { plano, assinatura } = useAssinatura()
  const { configuracao } = useOficinaData()
  const termos = useTermosOficina()

  const itensVisiveis = itensMais.filter((item) => {
    try {
      if (!session?.user) return false
      if (item.adminOnly) return ehAdminSistema(session.user)
      if (!podeAcessarModuloUsuario(session.user, item.modulo, configuracao)) return false
      if (item.modulo === 'financeiro') {
        return temRecursoComAssinatura(assinatura, 'financeiro_basico')
      }
      return podeAcessarModuloComPlano(session.user.papel, plano, item.modulo)
    } catch (err) {
      console.warn('[Craft] Erro ao filtrar item do menu mobile — ocultando', item.to, err)
      return false
    }
  })

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="flex max-h-[min(92dvh,640px)] flex-col max-lg:rounded-t-2xl max-lg:pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <DialogHeader>
          <DialogTitle>Mais opções</DialogTitle>
        </DialogHeader>
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
          <div className="grid gap-2">
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
                {to === '/motos' ? termos.veiculos : label}
              </NavLink>
            ))}
          </div>
        </nav>
        <Button variant="ghost" className="mt-2 w-full shrink-0 gap-2 lg:hidden" onClick={onFechar}>
          <X className="h-4 w-4" />
          Fechar
        </Button>
      </DialogContent>
    </Dialog>
  )
}
