import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Bike,
  Wrench,
  Wallet,
  Package,
  CalendarDays,
  Settings,
  UserCog,
  CreditCard,
  BarChart3,
  MessageCircle,
  Bell,
  UserCircle,
  ChevronLeft,
  ChevronRight,
  X,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCraft } from '@/context/CraftContext'
import { useAuth } from '@/context/AuthContext'
import { useAssinatura } from '@/context/AssinaturaContext'
import { podeAcessarModuloComPlano } from '@/services/assinatura/plano-features'
import type { ModuloCraft } from '@/services/auth/permissions'
import { getLabelPapel } from '@/types/auth'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const menuItems: { to: string; label: string; icone: typeof LayoutDashboard; modulo: ModuloCraft }[] = [
  { to: '/', label: 'Dashboard', icone: LayoutDashboard, modulo: 'dashboard' },
  { to: '/clientes', label: 'Clientes', icone: Users, modulo: 'clientes' },
  { to: '/portal-cliente', label: 'Portal do Cliente', icone: UserCircle, modulo: 'portal_cliente' },
  { to: '/motos', label: 'Motos', icone: Bike, modulo: 'motos' },
  { to: '/ordens-servico', label: 'Ordens de Serviço', icone: Wrench, modulo: 'ordens_servico' },
  { to: '/financeiro', label: 'Financeiro', icone: Wallet, modulo: 'financeiro' },
  { to: '/relatorios', label: 'Relatórios', icone: BarChart3, modulo: 'relatorios' },
  { to: '/comunicacao', label: 'Comunicação', icone: MessageCircle, modulo: 'comunicacao' },
  { to: '/lembretes', label: 'Lembretes', icone: Bell, modulo: 'lembretes' },
  { to: '/estoque', label: 'Estoque', icone: Package, modulo: 'estoque' },
  { to: '/agenda', label: 'Agenda', icone: CalendarDays, modulo: 'agenda' },
  { to: '/usuarios', label: 'Usuários', icone: UserCog, modulo: 'usuarios' },
  { to: '/planos', label: 'Planos', icone: CreditCard, modulo: 'planos' },
  { to: '/configuracoes', label: 'Configurações', icone: Settings, modulo: 'configuracoes' },
]

interface SidebarProps {
  mobileAberto?: boolean
  onFecharMobile?: () => void
}

export function Sidebar({ mobileAberto = false, onFecharMobile }: SidebarProps) {
  const { dados } = useCraft()
  const { session, logout } = useAuth()
  const { plano } = useAssinatura()
  const navigate = useNavigate()
  const [colapsado, setColapsado] = useState(false)

  const papel = session?.user.papel ?? 'recepcao'
  const itensVisiveis = menuItems.filter((item) =>
    podeAcessarModuloComPlano(papel, plano, item.modulo)
  )

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300',
        colapsado ? 'w-[72px]' : 'w-64',
        'max-lg:transition-transform max-lg:duration-300',
        mobileAberto ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
          C
        </div>
        {!colapsado && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold tracking-wide">{dados.configuracao.nome}</p>
            <p className="truncate text-xs text-muted-foreground">Gestão de Oficina</p>
          </div>
        )}
        {onFecharMobile && (
          <button
            onClick={onFecharMobile}
            className="rounded-lg p-1 text-muted-foreground hover:text-foreground lg:hidden cursor-pointer"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {itensVisiveis.map(({ to, label, icone: Icone }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onFecharMobile}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-active text-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )
            }
          >
            <Icone className="h-5 w-5 shrink-0" />
            {!colapsado && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-2">
        {!colapsado && session && (
          <div className="rounded-lg bg-muted/30 px-3 py-2">
            <p className="truncate text-sm font-medium">{session.user.nome}</p>
            <p className="truncate text-xs text-muted-foreground">{getLabelPapel(session.user.papel)}</p>
          </div>
        )}

        <Button
          variant="ghost"
          size={colapsado ? 'icon' : 'default'}
          className={cn('w-full text-muted-foreground hover:text-destructive', colapsado && 'mx-auto')}
          onClick={handleLogout}
          title="Sair da conta"
        >
          <LogOut className="h-4 w-4" />
          {!colapsado && <span className="ml-2">Sair da conta</span>}
        </Button>

        <button
          onClick={() => setColapsado(!colapsado)}
          className="hidden w-full items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground lg:flex cursor-pointer"
          aria-label={colapsado ? 'Expandir menu' : 'Recolher menu'}
        >
          {colapsado ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>
    </aside>
  )
}
