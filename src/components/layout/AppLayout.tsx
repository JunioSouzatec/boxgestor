import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TelaSemPermissao } from './TelaSemPermissao'
import { TelaRecursoPremium } from './TelaRecursoPremium'
import { useState } from 'react'
import { Menu, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useOficinaData } from '@/context/CraftContext'
import { LogoOficina } from '@/components/oficina/LogoOficina'
import { obterLogoUrlOficina, obterNomeExibidoOficina, resolverTituloPaginaApp } from '@/lib/oficina-marca'
import {
  planoPermiteModulo,
} from '@/services/assinatura/plano-features'
import { podeAcessarModuloUsuario, resolverModuloDaRota } from '@/services/auth/permissions'
import { getLabelPapel } from '@/types/auth'
import { PlanoBadge } from '@/components/plano/PlanoBadge'
import { IndicadorConexao, AvisoModoOffline } from '@/components/layout/IndicadorConexao'
import { IndicadorBanco } from '@/components/layout/IndicadorBanco'
import { AvisoPersistencia } from '@/components/layout/AvisoPersistencia'
import { BotaoInstalarApp } from '@/components/pwa/BotaoInstalarApp'
import { ehAdminSistema } from '@/lib/craft-admin'

const titulosPagina: Record<string, string> = {
  '/': 'Dashboard',
  '/clientes': 'Clientes',
  '/motos': 'Motos',
  '/ordens-servico': 'Ordens de Serviço',
  '/catalogo-servicos': 'Catálogo de Serviços',
  '/financeiro': 'Financeiro',
  '/relatorios': 'Relatórios',
  '/comunicacao': 'Comunicação',
  '/lembretes': 'Lembretes',
  '/portal-cliente': 'Portal do Cliente',
  '/estoque': 'Estoque',
  '/fornecedores': 'Fornecedores',
  '/agenda': 'Agenda',
  '/usuarios': 'Usuários',
  '/planos': 'Planos e Assinatura',
  '/configuracoes': 'Configurações',
  '/admin-craft': 'Admin Craft',
}

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session, logout } = useAuth()
  const { plano } = useAssinatura()
  const { configuracao } = useOficinaData()
  const [menuAberto, setMenuAberto] = useState(false)
  const titulo = resolverTituloPaginaApp(location.pathname, titulosPagina, configuracao)

  const moduloAtual = resolverModuloDaRota(location.pathname)

  const bloqueioPermissao =
    moduloAtual != null &&
    session?.user != null &&
    !podeAcessarModuloUsuario(session.user, moduloAtual)
  const bloqueioPlano =
    moduloAtual != null &&
    session?.user != null &&
    podeAcessarModuloUsuario(session.user, moduloAtual) &&
    moduloAtual !== 'admin_craft' &&
    !planoPermiteModulo(plano, moduloAtual)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar mobileAberto={menuAberto} onFecharMobile={() => setMenuAberto(false)} />

      {menuAberto && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMenuAberto(false)}
          aria-hidden
        />
      )}

      <div className="pl-0 transition-all lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <LogoOficina
              logoUrl={obterLogoUrlOficina(configuracao)}
              nome={obterNomeExibidoOficina(configuracao)}
              tamanho="xs"
              formato="circular"
              className="hidden sm:flex lg:hidden"
            />
            <div>
              <h2 className="text-lg font-semibold">{titulo}</h2>
            </div>
          </div>

          {session && (
            <div className="flex items-center gap-3">
              <BotaoInstalarApp variant="header" />
              {ehAdminSistema(session.user) && <IndicadorBanco />}
              <IndicadorConexao />
              <PlanoBadge />
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-none">{session.user?.nome ?? 'Usuário'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {getLabelPapel(session.user?.papel ?? 'recepcao')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="gap-2 text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          )}
        </header>

        <AvisoModoOffline />
        <AvisoPersistencia />

        <main className="p-4 sm:p-6">
          {bloqueioPermissao ? (
            <TelaSemPermissao tituloPagina={titulo} />
          ) : bloqueioPlano ? (
            <TelaRecursoPremium tituloPagina={titulo} />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  )
}
