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
  Truck,
  ClipboardList,
  Shield,
  LogOut,
  HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOficinaData } from '@/context/CraftContext'
import { MarcaOficinaHeader } from '@/components/oficina/MarcaOficinaHeader'
import { useAuth } from '@/context/AuthContext'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useLembretes } from '@/context/LembretesContext'
import { podeExibirModuloMenu } from '@/services/assinatura/plano-features'
import { podeAcessarModulo, type ModuloCraft } from '@/services/auth/permissions'
import { ehAdminSistema } from '@/lib/craft-admin'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import { getLabelPapel } from '@/types/auth'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const menuItems: { to: string; label: string; icone: typeof LayoutDashboard; modulo: ModuloCraft }[] = [
  { to: '/', label: 'Dashboard', icone: LayoutDashboard, modulo: 'dashboard' },
  { to: '/clientes', label: 'Clientes', icone: Users, modulo: 'clientes' },
  { to: '/portal-cliente', label: 'Portal do Cliente', icone: UserCircle, modulo: 'portal_cliente' },
  { to: '/motos', label: 'Motos', icone: Bike, modulo: 'motos' },
  { to: '/ordens-servico', label: 'Ordens de Serviço', icone: Wrench, modulo: 'ordens_servico' },
  { to: '/catalogo-servicos', label: 'Catálogo de Serviços', icone: ClipboardList, modulo: 'catalogo_servicos' },
  { to: '/financeiro', label: 'Financeiro', icone: Wallet, modulo: 'financeiro' },
  { to: '/relatorios', label: 'Relatórios', icone: BarChart3, modulo: 'relatorios' },
  { to: '/comunicacao', label: 'Comunicação', icone: MessageCircle, modulo: 'comunicacao' },
  { to: '/lembretes', label: 'Lembretes', icone: Bell, modulo: 'lembretes' },
  { to: '/estoque', label: 'Estoque', icone: Package, modulo: 'estoque' },
  { to: '/fornecedores', label: 'Fornecedores', icone: Truck, modulo: 'fornecedores' },
  { to: '/agenda', label: 'Agenda', icone: CalendarDays, modulo: 'agenda' },
  { to: '/usuarios', label: 'Usuários', icone: UserCog, modulo: 'usuarios' },
  { to: '/planos', label: 'Planos', icone: CreditCard, modulo: 'planos' },
  { to: '/como-usar', label: 'Como usar', icone: HelpCircle, modulo: 'dashboard' },
  { to: '/configuracoes', label: 'Configurações', icone: Settings, modulo: 'configuracoes' },
  { to: '/admin-craft', label: 'Admin BoxGestor', icone: Shield, modulo: 'admin_craft' },
]

interface SidebarProps {
  mobileAberto?: boolean
  onFecharMobile?: () => void
}

export function Sidebar({ mobileAberto = false, onFecharMobile }: SidebarProps) {
  const { configuracao } = useOficinaData()
  const { session, logout } = useAuth()
  const { assinatura } = useAssinatura()
  const { resumo } = useLembretes()
  const termos = useTermosOficina()
  const navigate = useNavigate()
  const [colapsado, setColapsado] = useState(false)

  const badgeLembretes = resumo.totalAlerta

  const itensVisiveis = menuItems.filter((item) => {
    try {
      if (!session?.user) return false
      if (item.modulo === 'admin_craft') return ehAdminSistema(session.user)
      return podeExibirModuloMenu(session.user, assinatura, item.modulo, configuracao)
    } catch (err) {
      console.warn('[Craft] Erro ao filtrar item do menu — fallback baseline', item.to, err)
      return (
        item.modulo === 'dashboard' ||
        (session?.user?.papel != null && podeAcessarModulo(session.user.papel, item.modulo))
      )
    }
  })

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen min-h-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300',
        colapsado ? 'w-[72px]' : 'w-64',
        'max-lg:transition-transform max-lg:duration-300',
        mobileAberto ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <MarcaOficinaHeader
          config={configuracao}
          colapsado={colapsado}
          tamanhoLogo="xs"
          className={cn(colapsado && 'justify-center w-full')}
        />
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

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 pb-4">
        {itensVisiveis.map(({ to, label, icone: Icone }) => {
          const rotulo = to === '/motos' ? termos.veiculos : label
          return (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onFecharMobile}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-active text-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )
            }
          >
            <Icone className="h-5 w-5 shrink-0" />
            {!colapsado && (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2 truncate">
                <span className="truncate">{rotulo}</span>
                {to === '/lembretes' && badgeLembretes > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-black">
                    {badgeLembretes > 99 ? '99+' : badgeLembretes}
                  </span>
                )}
              </span>
            )}
            {colapsado && to === '/lembretes' && badgeLembretes > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-500" />
            )}
          </NavLink>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-3 space-y-2">
        {!colapsado && session?.user && (
          <div className="rounded-lg bg-muted/30 px-3 py-2">
            <p className="truncate text-sm font-medium">{session.user.nome ?? 'Usuário'}</p>
            <p className="truncate text-xs text-muted-foreground">
              {ehAdminSistema(session.user)
                ? 'Administrador do Sistema'
                : getLabelPapel(session.user.papel ?? 'recepcao')}
            </p>
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
