import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, LogOut } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { MobileBottomNav } from './MobileBottomNav'
import { TelaSemPermissao } from './TelaSemPermissao'
import { TelaRecursoPremium } from './TelaRecursoPremium'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useOficinaData } from '@/context/CraftContext'
import { LogoOficina } from '@/components/oficina/LogoOficina'
import { obterLogoUrlOficina, obterNomeExibidoOficina, resolverTituloPaginaApp } from '@/lib/oficina-marca'
import {
  planoPermiteModuloParaEquipe,
  podeAcessarModuloFiscalComercial,
  temRecursoComAssinatura,
} from '@/services/assinatura/plano-features'
import { ModuloFiscalAviso } from '@/components/plano/ModuloFiscalAviso'
import {
  podeAcessarModuloUsuario,
  podeAcessarRotaFinanceiro,
  resolverModuloDaRota,
} from '@/services/auth/permissions'
import { getLabelPapel } from '@/types/auth'
import { PlanoBadge } from '@/components/plano/PlanoBadge'
import { AvisoTesteExpirado } from '@/components/plano/AvisoTesteExpirado'
import { FaixaStatusTeste } from '@/components/plano/FaixaStatusTeste'
import { IndicadorConexao, AvisoModoOffline } from '@/components/layout/IndicadorConexao'
import { IndicadorBanco } from '@/components/layout/IndicadorBanco'
import { AvisoPersistencia } from '@/components/layout/AvisoPersistencia'
import { NovaVersaoBanner } from '@/components/layout/NovaVersaoBanner'
import { BotaoInstalarApp } from '@/components/pwa/BotaoInstalarApp'
import { AvisoAtualizacaoPwa } from '@/components/pwa/AvisoAtualizacaoPwa'
import { ehAdminSistema } from '@/lib/craft-admin'
import { registrarContextoPermissoesDebug } from '@/lib/permissions-debug'
import { useTermosOficina } from '@/hooks/useTermosOficina'

const titulosPagina: Record<string, string> = {
  '/': 'Dashboard',
  '/clientes': 'Clientes',
  '/motos': 'Motos',
  '/ordens-servico': 'Ordens de Serviço',
  '/patio': 'Pátio',
  '/central-do-dia': 'Central do Dia',
  '/catalogo-servicos': 'Catálogo de Serviços',
  '/financeiro': 'Financeiro',
  '/caixa': 'Caixa',
  '/relatorios': 'Relatórios',
  '/gestor-inteligente': 'Gestor Inteligente',
  '/vendas-balcao': 'Vendas Balcão',
  '/fiscal': 'Notas fiscais',
  '/comunicacao': 'Comunicação',
  '/lembretes': 'Lembretes',
  '/portal-cliente': 'Portal do Cliente',
  '/estoque': 'Estoque',
  '/fornecedores': 'Fornecedores',
  '/agenda': 'Agenda',
  '/usuarios': 'Usuários',
  '/planos': 'Planos e Assinatura',
  '/configuracoes': 'Configurações',
  '/configuracoes/permissoes': 'Permissões da equipe',
  '/admin-craft': 'Admin BoxGestor',
}

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session, logout } = useAuth()
  const { assinatura } = useAssinatura()
  const { configuracao } = useOficinaData()
  const termos = useTermosOficina()
  const [menuAberto, setMenuAberto] = useState(false)
  const titulosComTermos = useMemo(
    () => ({ ...titulosPagina, '/motos': termos.veiculos }),
    [termos.veiculos]
  )
  const titulo = resolverTituloPaginaApp(location.pathname, titulosComTermos, configuracao)

  const moduloAtual = resolverModuloDaRota(location.pathname)

  useEffect(() => {
    const temSalvo = Boolean(
      configuracao?.permissions ??
        (configuracao as { metadata?: { permissions?: unknown } } | undefined)?.metadata
          ?.permissions
    )
    registrarContextoPermissoesDebug({
      rota: location.pathname,
      usuarioId: session?.user?.id,
      papel: session?.user?.papel,
      temPermissionsSalvo: temSalvo,
      permissionsValidas: true,
    })
  }, [location.pathname, session?.user?.id, session?.user?.papel, configuracao])

  const podeAcessarModuloAtual = useMemo(() => {
    if (moduloAtual == null || session?.user == null) return true
    try {
      return moduloAtual === 'financeiro'
        ? podeAcessarRotaFinanceiro(session.user, configuracao)
        : podeAcessarModuloUsuario(session.user, moduloAtual, configuracao)
    } catch (err) {
      console.warn('[Craft] Erro ao verificar permissão da rota — fallback seguro', err)
      return moduloAtual === 'dashboard'
    }
  }, [moduloAtual, session?.user, configuracao])

  const bloqueioPermissao =
    moduloAtual != null && session?.user != null && !podeAcessarModuloAtual

  const bloqueioFiscalAdicional =
    moduloAtual === 'notas_fiscais' &&
    session?.user != null &&
    podeAcessarModuloAtual &&
    !podeAcessarModuloFiscalComercial(assinatura, session.user)

  const bloqueioPlano =
    moduloAtual != null &&
    session?.user != null &&
    podeAcessarModuloAtual &&
    moduloAtual !== 'admin_craft' &&
    !bloqueioFiscalAdicional &&
    (moduloAtual === 'financeiro'
      ? !temRecursoComAssinatura(assinatura, 'financeiro_basico')
      : moduloAtual === 'caixa' ||
          moduloAtual === 'gestor_inteligente' ||
          moduloAtual === 'vendas_balcao'
        ? !temRecursoComAssinatura(assinatura, 'financeiro_basico') ||
          !planoPermiteModuloParaEquipe(
            assinatura,
            moduloAtual,
            session.user.papel,
            session.user
          )
        : !planoPermiteModuloParaEquipe(
            assinatura,
            moduloAtual,
            session.user.papel,
            session.user
          ))

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
              aria-label="Abrir menu completo"
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
        <NovaVersaoBanner />
        <FaixaStatusTeste />
        <AvisoTesteExpirado />

        <main className="p-4 pb-24 sm:p-6 lg:pb-6">
          {bloqueioPermissao ? (
            <TelaSemPermissao tituloPagina={titulo} />
          ) : bloqueioFiscalAdicional ? (
            <div className="mx-auto max-w-xl space-y-4">
              <h1 className="text-xl font-semibold">{titulo}</h1>
              <ModuloFiscalAviso />
            </div>
          ) : bloqueioPlano ? (
            <TelaRecursoPremium tituloPagina={titulo} />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
      <MobileBottomNav />
      <AvisoAtualizacaoPwa />
    </div>
  )
}
