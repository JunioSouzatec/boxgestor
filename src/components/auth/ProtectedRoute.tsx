import { Navigate, Outlet } from 'react-router-dom'
import { AuthFallbackScreen, CarregandoAuth } from '@/components/auth/AuthFallbackScreen'
import { useAuth } from '@/context/AuthContext'
import { isModoAuthSupabaseAtivo } from '@/lib/craft-auth'
import { sessaoLocalValida } from '@/lib/session-safe'
import { getRotaPorEstadoAuth } from '@/services/auth/supabase-auth-state.service'

export function ProtectedRoute() {
  const { session, loading, estadoAuth, erroAuth } = useAuth()
  const supabaseMode = isModoAuthSupabaseAtivo()

  if (loading || estadoAuth === 'carregando') {
    return <CarregandoAuth />
  }

  if (supabaseMode) {
    if (estadoAuth === 'erro') {
      return <AuthFallbackScreen mensagem={erroAuth ?? undefined} />
    }

    if (estadoAuth === 'nao_autenticado') {
      return <Navigate to="/login" replace />
    }

    if (estadoAuth === 'sem_perfil') {
      return <Navigate to="/completar-cadastro" replace />
    }

    if (estadoAuth === 'sem_oficina') {
      return <Navigate to="/criar-oficina" replace />
    }

    if (!sessaoLocalValida(session)) {
      return <CarregandoAuth />
    }

    return <Outlet />
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

/** Rotas de onboarding — requer sessão Supabase parcial (sem oficina completa) */
export function OnboardingRoute() {
  const { loading, estadoAuth, erroAuth } = useAuth()

  if (!isModoAuthSupabaseAtivo()) {
    return <Navigate to="/" replace />
  }

  if (loading || estadoAuth === 'carregando') {
    return <CarregandoAuth />
  }

  if (estadoAuth === 'erro') {
    return <AuthFallbackScreen mensagem={erroAuth ?? undefined} />
  }

  if (estadoAuth === 'nao_autenticado') {
    return <Navigate to="/login" replace />
  }

  if (estadoAuth === 'pronto') {
    return <Navigate to={getRotaPorEstadoAuth('pronto')} replace />
  }

  return <Outlet />
}

export function PublicRoute() {
  const { session, loading, estadoAuth } = useAuth()
  const supabaseMode = isModoAuthSupabaseAtivo()

  if (loading || estadoAuth === 'carregando') {
    return <CarregandoAuth />
  }

  if (supabaseMode) {
    if (estadoAuth === 'sem_perfil') {
      return <Navigate to="/completar-cadastro" replace />
    }
    if (estadoAuth === 'sem_oficina') {
      return <Navigate to="/criar-oficina" replace />
    }
    if (estadoAuth === 'pronto' && sessaoLocalValida(session)) {
      return (
        <Navigate
          to={getRotaPorEstadoAuth('pronto', session.user.papel)}
          replace
        />
      )
    }
    return <Outlet />
  }

  if (session) {
    return (
      <Navigate
        to={getRotaPorEstadoAuth('pronto', session.user?.papel ?? 'recepcao')}
        replace
      />
    )
  }

  return <Outlet />
}
