import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Home, Wrench, Users, Bell, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MobileMaisMenu, ROTAS_MENU_MAIS } from '@/components/layout/MobileMaisMenu'
import { useComunicacao } from '@/context/ComunicacaoContext'

const itensPrincipais = [
  { to: '/', label: 'Início', icone: Home, exato: true },
  { to: '/ordens-servico', label: 'OS', icone: Wrench, exato: false },
  { to: '/clientes', label: 'Clientes', icone: Users, exato: false },
  { to: '/lembretes', label: 'Lembretes', icone: Bell, exato: false },
] as const

export function MobileBottomNav() {
  const location = useLocation()
  const [maisAberto, setMaisAberto] = useState(false)
  const { resumoAlertas } = useComunicacao()

  const badgeMais = resumoAlertas.pendentes
  const maisUrgente = resumoAlertas.vencidos > 0 || resumoAlertas.hoje > 0

  const maisAtivo = ROTAS_MENU_MAIS.some(
    (rota) => location.pathname === rota || location.pathname.startsWith(`${rota}/`)
  )

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        aria-label="Navegação principal"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {itensPrincipais.map(({ to, label, icone: Icone, exato }) => (
            <NavLink
              key={to}
              to={to}
              end={exato}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )
              }
            >
              <Icone className="h-5 w-5" aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMaisAberto(true)}
            className={cn(
              'flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors',
              maisAtivo || maisAberto ? 'text-primary' : 'text-muted-foreground'
            )}
            aria-label="Mais opções"
            aria-expanded={maisAberto}
          >
            <span className="relative">
              <MoreHorizontal className="h-5 w-5" aria-hidden />
              {badgeMais > 0 && (
                <span
                  className={cn(
                    'absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none',
                    maisUrgente
                      ? 'bg-destructive text-destructive-foreground'
                      : 'bg-amber-500 text-black'
                  )}
                >
                  {badgeMais > 99 ? '99+' : badgeMais}
                </span>
              )}
            </span>
            <span>Mais</span>
          </button>
        </div>
      </nav>

      <MobileMaisMenu aberto={maisAberto} onFechar={() => setMaisAberto(false)} />
    </>
  )
}
