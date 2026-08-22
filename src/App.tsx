import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { APP_NAME } from '@/lib/app-brand'
import { AuthProvider } from '@/context/AuthContext'
import { CraftProviderWrapper } from '@/context/CraftContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ProtectedRoute, PublicRoute, OnboardingRoute } from '@/components/auth/ProtectedRoute'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { ToastProvider } from '@/context/ToastContext'
import { ConfirmacaoProvider } from '@/context/ConfirmacaoContext'
import { PersistenceToastListener } from '@/components/shared/PersistenceToastListener'

/** Auth de entrada — permanece no bundle inicial (primeira tela do usuário). */
import { LoginPage } from '@/pages/auth/LoginPage'
import { CadastroPage } from '@/pages/auth/CadastroPage'
import { RecuperarSenhaPage } from '@/pages/auth/RecuperarSenhaPage'
import { OnboardingOficinaPage } from '@/pages/auth/OnboardingOficinaPage'

/* Páginas sob demanda — reduzem o chunk inicial (PERF A1.1). */
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
)
const ClienteDetalhePage = lazy(() =>
  import('@/pages/ClienteDetalhePage').then((m) => ({ default: m.ClienteDetalhePage }))
)
const ClientesPage = lazy(() =>
  import('@/pages/ClientesPage').then((m) => ({ default: m.ClientesPage }))
)
const MotosPage = lazy(() =>
  import('@/pages/MotosPage').then((m) => ({ default: m.MotosPage }))
)
const OrdensServicoPage = lazy(() =>
  import('@/pages/OrdensServicoPage').then((m) => ({ default: m.OrdensServicoPage }))
)
const OrdensServicoVisualizarPage = lazy(() =>
  import('@/pages/OrdensServicoVisualizarPage').then((m) => ({
    default: m.OrdensServicoVisualizarPage,
  }))
)
const PatioPage = lazy(() =>
  import('@/pages/PatioPage').then((m) => ({ default: m.PatioPage }))
)
const CentralDoDiaPage = lazy(() =>
  import('@/pages/CentralDoDiaPage').then((m) => ({ default: m.CentralDoDiaPage }))
)
const CatalogoServicosPage = lazy(() =>
  import('@/pages/CatalogoServicosPage').then((m) => ({ default: m.CatalogoServicosPage }))
)
const FinanceiroPage = lazy(() =>
  import('@/pages/FinanceiroPage').then((m) => ({ default: m.FinanceiroPage }))
)
const CaixaPage = lazy(() =>
  import('@/pages/CaixaPage').then((m) => ({ default: m.CaixaPage }))
)
const EstoquePage = lazy(() =>
  import('@/pages/EstoquePage').then((m) => ({ default: m.EstoquePage }))
)
const FornecedoresPage = lazy(() =>
  import('@/pages/FornecedoresPage').then((m) => ({ default: m.FornecedoresPage }))
)
const AgendaPage = lazy(() =>
  import('@/pages/AgendaPage').then((m) => ({ default: m.AgendaPage }))
)
const ConfiguracoesPage = lazy(() =>
  import('@/pages/ConfiguracoesPage').then((m) => ({ default: m.ConfiguracoesPage }))
)
const PermissoesEquipePage = lazy(() =>
  import('@/pages/PermissoesEquipePage').then((m) => ({ default: m.PermissoesEquipePage }))
)
const UsuariosPage = lazy(() =>
  import('@/pages/UsuariosPage').then((m) => ({ default: m.UsuariosPage }))
)
const PlanosAssinaturaPage = lazy(() =>
  import('@/pages/PlanosAssinaturaPage').then((m) => ({ default: m.PlanosAssinaturaPage }))
)
const ComoUsarPage = lazy(() =>
  import('@/pages/ComoUsarPage').then((m) => ({ default: m.ComoUsarPage }))
)
const AdminCraftPage = lazy(() =>
  import('@/pages/AdminCraftPage').then((m) => ({ default: m.AdminCraftPage }))
)
const RelatoriosPage = lazy(() =>
  import('@/pages/RelatoriosPage').then((m) => ({ default: m.RelatoriosPage }))
)
const GestorInteligentePage = lazy(() =>
  import('@/pages/GestorInteligentePage').then((m) => ({ default: m.GestorInteligentePage }))
)
const VendasBalcaoPage = lazy(() =>
  import('@/pages/VendasBalcaoPage').then((m) => ({ default: m.VendasBalcaoPage }))
)
const FiscalPage = lazy(() =>
  import('@/pages/FiscalPage').then((m) => ({ default: m.FiscalPage }))
)
const ComunicacaoPage = lazy(() =>
  import('@/pages/ComunicacaoPage').then((m) => ({ default: m.ComunicacaoPage }))
)
const LembretesPage = lazy(() =>
  import('@/pages/LembretesPage').then((m) => ({ default: m.LembretesPage }))
)
const PortalClientePage = lazy(() =>
  import('@/pages/PortalClientePage').then((m) => ({ default: m.PortalClientePage }))
)
const PortalClienteDetalhePage = lazy(() =>
  import('@/pages/PortalClienteDetalhePage').then((m) => ({
    default: m.PortalClienteDetalhePage,
  }))
)
const ConvitePage = lazy(() =>
  import('@/pages/auth/ConvitePage').then((m) => ({ default: m.ConvitePage }))
)
const AprovarOrcamentoPage = lazy(() =>
  import('@/pages/public/AprovarOrcamentoPage').then((m) => ({
    default: m.AprovarOrcamentoPage,
  }))
)
const PortalClientePublicoPage = lazy(() =>
  import('@/pages/public/PortalClientePublicoPage').then((m) => ({
    default: m.PortalClientePublicoPage,
  }))
)

function RotaCarregando() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-muted-foreground">
      Carregando tela...
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary titulo={`Erro ao iniciar o ${APP_NAME}`}>
      <BrowserRouter>
        <ToastProvider>
          <ConfirmacaoProvider>
            <PersistenceToastListener />
            <AuthProvider>
              <Suspense fallback={<RotaCarregando />}>
                <Routes>
                  <Route element={<PublicRoute />}>
                    <Route path="/aprovar-orcamento/:token" element={<AprovarOrcamentoPage />} />
                    <Route path="/portal/:token" element={<PortalClientePublicoPage />} />
                    <Route element={<AuthLayout />}>
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/cadastro" element={<CadastroPage />} />
                      <Route path="/comece-agora" element={<CadastroPage />} />
                      <Route path="/recuperar-senha" element={<RecuperarSenhaPage />} />
                      <Route path="/convite/:token" element={<ConvitePage />} />
                    </Route>
                  </Route>

                  <Route element={<OnboardingRoute />}>
                    <Route element={<AuthLayout />}>
                      <Route
                        path="/completar-cadastro"
                        element={<OnboardingOficinaPage variant="completar-cadastro" />}
                      />
                      <Route
                        path="/criar-oficina"
                        element={<OnboardingOficinaPage variant="criar-oficina" />}
                      />
                    </Route>
                  </Route>

                  <Route element={<ProtectedRoute />}>
                    <Route element={<CraftProviderWrapper />}>
                      <Route
                        element={
                          <ErrorBoundary titulo="Não foi possível carregar esta tela.">
                            <AppLayout />
                          </ErrorBoundary>
                        }
                      >
                        <Route index element={<DashboardPage />} />
                        <Route path="clientes" element={<ClientesPage />} />
                        <Route path="clientes/:clienteId" element={<ClienteDetalhePage />} />
                        <Route path="motos" element={<MotosPage />} />
                        <Route path="ordens-servico" element={<OrdensServicoPage />} />
                        <Route
                          path="ordens-servico/:id/visualizar"
                          element={<OrdensServicoVisualizarPage />}
                        />
                        <Route path="patio" element={<PatioPage />} />
                        <Route path="central-do-dia" element={<CentralDoDiaPage />} />
                        <Route path="catalogo-servicos" element={<CatalogoServicosPage />} />
                        <Route path="financeiro" element={<FinanceiroPage />} />
                        <Route path="caixa" element={<CaixaPage />} />
                        <Route path="estoque" element={<EstoquePage />} />
                        <Route path="fornecedores" element={<FornecedoresPage />} />
                        <Route path="agenda" element={<AgendaPage />} />
                        <Route path="configuracoes" element={<ConfiguracoesPage />} />
                        <Route path="configuracoes/permissoes" element={<PermissoesEquipePage />} />
                        <Route path="usuarios" element={<UsuariosPage />} />
                        <Route path="planos" element={<PlanosAssinaturaPage />} />
                        <Route path="como-usar" element={<ComoUsarPage />} />
                        <Route path="admin-craft" element={<AdminCraftPage />} />
                        <Route path="relatorios" element={<RelatoriosPage />} />
                        <Route path="gestor-inteligente" element={<GestorInteligentePage />} />
                        <Route path="vendas-balcao" element={<VendasBalcaoPage />} />
                        <Route path="fiscal" element={<FiscalPage />} />
                        <Route path="comunicacao" element={<ComunicacaoPage />} />
                        <Route path="lembretes" element={<LembretesPage />} />
                        <Route path="portal-cliente" element={<PortalClientePage />} />
                        <Route
                          path="portal-cliente/:clienteId"
                          element={<PortalClienteDetalhePage />}
                        />
                      </Route>
                    </Route>
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </AuthProvider>
          </ConfirmacaoProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
