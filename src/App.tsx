import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { CraftProviderWrapper } from '@/context/CraftContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ProtectedRoute, PublicRoute, OnboardingRoute } from '@/components/auth/ProtectedRoute'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { DashboardPage } from '@/pages/DashboardPage'
import { ClienteDetalhePage } from '@/pages/ClienteDetalhePage'
import { ClientesPage } from '@/pages/ClientesPage'
import { MotosPage } from '@/pages/MotosPage'
import { OrdensServicoPage } from '@/pages/OrdensServicoPage'
import { CatalogoServicosPage } from '@/pages/CatalogoServicosPage'
import { FinanceiroPage } from '@/pages/FinanceiroPage'
import { EstoquePage } from '@/pages/EstoquePage'
import { FornecedoresPage } from '@/pages/FornecedoresPage'
import { AgendaPage } from '@/pages/AgendaPage'
import { ConfiguracoesPage } from '@/pages/ConfiguracoesPage'
import { UsuariosPage } from '@/pages/UsuariosPage'
import { PlanosAssinaturaPage } from '@/pages/PlanosAssinaturaPage'
import { RelatoriosPage } from '@/pages/RelatoriosPage'
import { ComunicacaoPage } from '@/pages/ComunicacaoPage'
import { LembretesPage } from '@/pages/LembretesPage'
import { PortalClientePage } from '@/pages/PortalClientePage'
import { PortalClienteDetalhePage } from '@/pages/PortalClienteDetalhePage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { CadastroPage } from '@/pages/auth/CadastroPage'
import { RecuperarSenhaPage } from '@/pages/auth/RecuperarSenhaPage'
import { OnboardingOficinaPage } from '@/pages/auth/OnboardingOficinaPage'

export default function App() {
  return (
    <ErrorBoundary titulo="Erro ao iniciar o Craft Oficina">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
          <Route element={<PublicRoute />}>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/cadastro" element={<CadastroPage />} />
              <Route path="/recuperar-senha" element={<RecuperarSenhaPage />} />
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
                <Route path="catalogo-servicos" element={<CatalogoServicosPage />} />
                <Route path="financeiro" element={<FinanceiroPage />} />
                <Route path="estoque" element={<EstoquePage />} />
                <Route path="fornecedores" element={<FornecedoresPage />} />
                <Route path="agenda" element={<AgendaPage />} />
                <Route path="configuracoes" element={<ConfiguracoesPage />} />
                <Route path="usuarios" element={<UsuariosPage />} />
                <Route path="planos" element={<PlanosAssinaturaPage />} />
                <Route path="relatorios" element={<RelatoriosPage />} />
                <Route path="comunicacao" element={<ComunicacaoPage />} />
                <Route path="lembretes" element={<LembretesPage />} />
                <Route path="portal-cliente" element={<PortalClientePage />} />
                <Route path="portal-cliente/:clienteId" element={<PortalClienteDetalhePage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
