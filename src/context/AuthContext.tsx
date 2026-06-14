import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  getCraftAuthMode,
  isModoAuthLocalAtivo,
  isModoAuthSupabaseAtivo,
  obterModoAuthLabel,
} from '@/lib/craft-auth'
import { ativarFallbackLocalStorage } from '@/lib/craft-auth-fallback'
import { obterOfficeIdDaSessao, sessaoLocalValida } from '@/lib/session-safe'
import { getSupabaseClient, requireSupabaseClient } from '@/lib/supabase'
import {
  createAuthService,
  deveUsarSupabaseAuth,
  isLocalAuthService,
  isSupabaseAuthService,
} from '@/services/auth/auth.factory'
import { DEMO_CREDENTIALS } from '@/services/auth/local-auth.service'
import {
  avaliarEstadoSupabase,
  getRotaPorEstadoAuth,
  obterSessaoSupabaseAtual,
  type AvaliacaoEstadoSupabase,
  type EstadoAutenticacao,
} from '@/services/auth/supabase-auth-state.service'
import { traduzirErroAuth } from '@/services/auth/supabase-auth.mappers'
import type { IAuthService } from '@/services/auth/auth.types'
import type {
  AuthSession,
  AuthUser,
  CadastroOficinaInput,
  LoginInput,
  UsuarioInput,
  UsuarioUpdateInput,
} from '@/types/auth'
import type { ConviteInput, ConviteUsuario } from '@/services/auth/convites.service'
import { listarConvitesPendentesAsync } from '@/services/auth/convites.service'

export interface AuthLoginResult {
  session: AuthSession | null
  redirectTo: string
  requerConfirmacaoEmail?: boolean
}

interface AuthContextValue {
  session: AuthSession | null
  loading: boolean
  modoAuth: 'local' | 'supabase'
  modoAuthLabel: string
  officeId: string | null
  estadoAuth: EstadoAutenticacao
  erroAuth: string | null
  emailSupabase: string | null
  login: (input: LoginInput) => Promise<AuthLoginResult>
  logout: () => Promise<void>
  register: (input: CadastroOficinaInput) => Promise<AuthLoginResult>
  requestPasswordReset: (email: string) => Promise<void>
  listarUsuarios: () => AuthUser[]
  carregarUsuarios: () => Promise<AuthUser[]>
  criarUsuario: (input: UsuarioInput) => Promise<AuthUser>
  atualizarUsuario: (userId: string, patch: UsuarioUpdateInput) => Promise<AuthUser>
  excluirUsuario: (userId: string) => Promise<void>
  prepararConvite: (input: ConviteInput, nomeOficina?: string) => Promise<ConviteUsuario>
  carregarConvitesPendentes: () => Promise<ConviteUsuario[]>
  cancelarConvite: (conviteId: string) => Promise<void>
  aceitarConvite: (token: string, senha: string) => Promise<AuthLoginResult>
  refreshSession: () => void
  recarregarAuth: () => Promise<void>
  ativarModoLocalFallback: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
  authService?: IAuthService
}

async function inicializarSessaoLocal(authService: IAuthService): Promise<AuthSession | null> {
  let session = authService.getSession()

  if (!session && isLocalAuthService(authService) && isModoAuthLocalAtivo()) {
    try {
      session = await authService.login({
        email: DEMO_CREDENTIALS.email,
        senha: DEMO_CREDENTIALS.senha,
      })
    } catch (e) {
      console.warn('[Craft Auth] Auto-login demo indisponível:', e)
      session = authService.getSession()
    }
  }

  return session
}

function resultadoLogin(avaliacao: AvaliacaoEstadoSupabase): AuthLoginResult {
  const redirectTo = getRotaPorEstadoAuth(
    avaliacao.estado,
    avaliacao.authSession?.user.papel
  )
  return {
    session: avaliacao.authSession,
    redirectTo,
  }
}

export function AuthProvider({
  children,
  authService = createAuthService(),
}: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [estadoAuth, setEstadoAuth] = useState<EstadoAutenticacao>('carregando')
  const [erroAuth, setErroAuth] = useState<string | null>(null)
  const [emailSupabase, setEmailSupabase] = useState<string | null>(null)

  const modoAuth = getCraftAuthMode()
  const modoAuthLabel = obterModoAuthLabel()
  const officeId = sessaoLocalValida(session) ? obterOfficeIdDaSessao(session) : null

  const aplicarAvaliacao = useCallback(
    (avaliacao: AvaliacaoEstadoSupabase) => {
      setEstadoAuth(avaliacao.estado)
      setSession(avaliacao.authSession)
      setEmailSupabase(avaliacao.email)
      setErroAuth(avaliacao.estado === 'erro' ? avaliacao.mensagemUsuario : null)

      if (isSupabaseAuthService(authService)) {
        authService.setCachedSession(avaliacao.authSession)
      }
    },
    [authService]
  )

  const recarregarAuth = useCallback(async () => {
    setLoading(true)
    setErroAuth(null)
    try {
      if (deveUsarSupabaseAuth() && isSupabaseAuthService(authService)) {
        const sbSession = await obterSessaoSupabaseAtual()
        if (!sbSession) {
          setEstadoAuth('nao_autenticado')
          setSession(null)
          setEmailSupabase(null)
          authService.setCachedSession(null)
          return
        }
        const avaliacao = await avaliarEstadoSupabase(sbSession)
        aplicarAvaliacao(avaliacao)
        return
      }

      const localSession = authService.getSession() ?? (await inicializarSessaoLocal(authService))
      setSession(localSession)
      setEstadoAuth(localSession ? 'pronto' : 'nao_autenticado')
      setEmailSupabase(null)
    } catch (e) {
      console.error('[Craft Auth] Erro ao recarregar:', e)
      setEstadoAuth('erro')
      setErroAuth(e instanceof Error ? e.message : 'Erro ao recarregar autenticação.')
    } finally {
      setLoading(false)
    }
  }, [aplicarAvaliacao, authService])

  const refreshSession = useCallback(() => {
    void recarregarAuth()
  }, [recarregarAuth])

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    async function init() {
      try {
        if (deveUsarSupabaseAuth() && isSupabaseAuthService(authService)) {
          const supabase = getSupabaseClient()
          if (!supabase) {
            console.warn('[Craft Auth] Supabase indisponível.')
            setEstadoAuth('erro')
            setErroAuth(
              'Supabase não configurado. Verifique .env.local ou use "Voltar para modo local".'
            )
            return
          }

          const sbSession = await obterSessaoSupabaseAtual()
          if (cancelled) return

          const avaliacao = await avaliarEstadoSupabase(sbSession)
          if (!cancelled) aplicarAvaliacao(avaliacao)

          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
            if (cancelled) return
            try {
              const next = await avaliarEstadoSupabase(nextSession)
              aplicarAvaliacao(next)
            } catch (e) {
              console.error('[Craft Auth] onAuthStateChange:', e)
              setEstadoAuth('erro')
              setErroAuth('Erro ao atualizar sessão Supabase.')
            }
          })

          unsubscribe = () => subscription.unsubscribe()
          return
        }

        const localSession = await inicializarSessaoLocal(authService)
        if (!cancelled) {
          setSession(localSession)
          setEstadoAuth(localSession ? 'pronto' : 'nao_autenticado')
        }
      } catch (e) {
        console.error('[Craft Auth] Erro ao inicializar sessão:', e)
        if (!cancelled) {
          setEstadoAuth('erro')
          setErroAuth(e instanceof Error ? e.message : 'Erro ao inicializar autenticação.')
          setSession(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void init()

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [aplicarAvaliacao, authService])

  const login = useCallback(
    async (input: LoginInput): Promise<AuthLoginResult> => {
      if (deveUsarSupabaseAuth() && isSupabaseAuthService(authService)) {
        const supabase = requireSupabaseClient()
        const { data, error } = await supabase.auth.signInWithPassword({
          email: input.email.trim().toLowerCase(),
          password: input.senha,
        })

        if (error) throw new Error(traduzirErroAuth(error.message))
        if (!data.session) throw new Error('Login não retornou sessão válida.')

        const avaliacao = await avaliarEstadoSupabase(data.session)
        aplicarAvaliacao(avaliacao)
        return resultadoLogin(avaliacao)
      }

      const newSession = await authService.login(input)
      setSession(newSession)
      setEstadoAuth('pronto')
      return {
        session: newSession,
        redirectTo: getRotaPorEstadoAuth('pronto', newSession.user.papel),
      }
    },
    [aplicarAvaliacao, authService]
  )

  const logout = useCallback(async () => {
    await authService.logout()
    setSession(null)
    setEstadoAuth('nao_autenticado')
    setEmailSupabase(null)
    setErroAuth(null)
  }, [authService])

  const register = useCallback(
    async (input: CadastroOficinaInput): Promise<AuthLoginResult> => {
      if (deveUsarSupabaseAuth() && isSupabaseAuthService(authService)) {
        await authService.register(input)
        const sbSession = await obterSessaoSupabaseAtual()
        const avaliacao = await avaliarEstadoSupabase(sbSession)
        aplicarAvaliacao(avaliacao)
        return resultadoLogin(avaliacao)
      }

      const newSession = await authService.register(input)
      setSession(newSession)
      setEstadoAuth('pronto')
      return {
        session: newSession,
        redirectTo: getRotaPorEstadoAuth('pronto', newSession.user.papel),
      }
    },
    [aplicarAvaliacao, authService]
  )

  const requestPasswordReset = useCallback(
    async (email: string) => {
      await authService.requestPasswordReset(email)
    },
    [authService]
  )

  const ativarModoLocalFallback = useCallback(async () => {
    ativarFallbackLocalStorage()
    try {
      const supabase = getSupabaseClient()
      if (supabase) await supabase.auth.signOut()
    } catch (e) {
      console.warn('[Craft Auth] Erro ao sair do Supabase no fallback:', e)
    }
    window.location.reload()
  }, [])

  const listarUsuarios = useCallback(() => {
    const oid = obterOfficeIdDaSessao(session, '')
    if (!oid) return []
    return authService.listarUsuariosOficina(oid)
  }, [authService, session])

  const carregarUsuarios = useCallback(async () => {
    const oid = obterOfficeIdDaSessao(session, '')
    if (!oid) return []
    if (isSupabaseAuthService(authService)) {
      return authService.listarUsuariosOficinaAsync(oid)
    }
    return authService.listarUsuariosOficina(oid)
  }, [authService, session])

  const criarUsuario = useCallback(
    async (input: UsuarioInput) => {
      if (!sessaoLocalValida(session)) throw new Error('Sessão expirada.')
      const user = await authService.criarUsuario(session.user, input)
      refreshSession()
      return user
    },
    [authService, session, refreshSession]
  )

  const atualizarUsuario = useCallback(
    async (userId: string, patch: UsuarioUpdateInput) => {
      if (!sessaoLocalValida(session)) throw new Error('Sessão expirada.')
      const user = await authService.atualizarUsuario(session.user, userId, patch)
      refreshSession()
      return user
    },
    [authService, session, refreshSession]
  )

  const excluirUsuario = useCallback(
    async (userId: string) => {
      if (!sessaoLocalValida(session)) throw new Error('Sessão expirada.')
      await authService.excluirUsuario(session.user, userId)
      refreshSession()
    },
    [authService, session, refreshSession]
  )

  const prepararConvite = useCallback(
    async (input: ConviteInput, nomeOficina?: string) => {
      if (!sessaoLocalValida(session)) throw new Error('Sessão expirada.')
      if (isLocalAuthService(authService)) {
        return authService.prepararConvite(session.user, input, nomeOficina)
      }
      if (isSupabaseAuthService(authService)) {
        return authService.prepararConvite(session.user, input, nomeOficina)
      }
      throw new Error('Modo de autenticação não suportado.')
    },
    [authService, session]
  )

  const carregarConvitesPendentes = useCallback(async () => {
    const oid = obterOfficeIdDaSessao(session, '')
    if (!oid) return []
    if (isLocalAuthService(authService)) {
      return authService.listarConvitesPendentes(oid)
    }
    if (isSupabaseAuthService(authService)) {
      return authService.listarConvitesPendentes(oid)
    }
    return listarConvitesPendentesAsync(oid)
  }, [authService, session])

  const cancelarConvite = useCallback(
    async (conviteId: string) => {
      if (!sessaoLocalValida(session)) throw new Error('Sessão expirada.')
      if (isLocalAuthService(authService)) {
        authService.cancelarConvite(session.user, conviteId)
        return
      }
      if (isSupabaseAuthService(authService)) {
        await authService.cancelarConvite(session.user, conviteId)
      }
    },
    [authService, session]
  )

  const aceitarConvite = useCallback(
    async (token: string, senha: string): Promise<AuthLoginResult> => {
      if (isLocalAuthService(authService)) {
        const newSession = authService.aceitarConvite(token, senha)
        setSession(newSession)
        setEstadoAuth('pronto')
        return {
          session: newSession,
          redirectTo: getRotaPorEstadoAuth('pronto', newSession.user.papel),
        }
      }
      if (isSupabaseAuthService(authService)) {
        const result = await authService.aceitarConvite(token, senha)
        if (result.session) {
          setSession(result.session)
          setEstadoAuth('pronto')
          authService.setCachedSession(result.session)
        }
        return result
      }
      throw new Error('Não foi possível aceitar o convite neste modo.')
    },
    [authService]
  )

  const value = useMemo(
    () => ({
      session,
      loading,
      modoAuth,
      modoAuthLabel,
      officeId,
      estadoAuth,
      erroAuth,
      emailSupabase,
      login,
      logout,
      register,
      requestPasswordReset,
      listarUsuarios,
      carregarUsuarios,
      criarUsuario,
      atualizarUsuario,
      excluirUsuario,
      prepararConvite,
      carregarConvitesPendentes,
      cancelarConvite,
      aceitarConvite,
      refreshSession,
      recarregarAuth,
      ativarModoLocalFallback,
    }),
    [
      session,
      loading,
      modoAuth,
      modoAuthLabel,
      officeId,
      estadoAuth,
      erroAuth,
      emailSupabase,
      login,
      logout,
      register,
      requestPasswordReset,
      listarUsuarios,
      carregarUsuarios,
      criarUsuario,
      atualizarUsuario,
      excluirUsuario,
      prepararConvite,
      carregarConvitesPendentes,
      cancelarConvite,
      aceitarConvite,
      refreshSession,
      recarregarAuth,
      ativarModoLocalFallback,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}

export function useModoSupabaseAuth(): boolean {
  return isModoAuthSupabaseAtivo()
}
