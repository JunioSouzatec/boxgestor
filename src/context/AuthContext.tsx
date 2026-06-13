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
  obterModoAuthLabel,
} from '@/lib/craft-auth'
import { obterOfficeIdDaSessao, sessaoLocalValida } from '@/lib/session-safe'
import { getSupabaseClient } from '@/lib/supabase'
import {
  createAuthService,
  deveUsarSupabaseAuth,
  isLocalAuthService,
  isSupabaseAuthService,
} from '@/services/auth/auth.factory'
import { DEMO_CREDENTIALS } from '@/services/auth/local-auth.service'
import type { IAuthService } from '@/services/auth/auth.types'
import type {
  AuthSession,
  AuthUser,
  CadastroOficinaInput,
  LoginInput,
  UsuarioInput,
  UsuarioUpdateInput,
} from '@/types/auth'

interface AuthContextValue {
  session: AuthSession | null
  loading: boolean
  modoAuth: 'local' | 'supabase'
  modoAuthLabel: string
  officeId: string | null
  login: (input: LoginInput) => Promise<AuthSession>
  logout: () => Promise<void>
  register: (input: CadastroOficinaInput) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  listarUsuarios: () => AuthUser[]
  carregarUsuarios: () => Promise<AuthUser[]>
  criarUsuario: (input: UsuarioInput) => Promise<AuthUser>
  atualizarUsuario: (userId: string, patch: UsuarioUpdateInput) => Promise<AuthUser>
  excluirUsuario: (userId: string) => Promise<void>
  refreshSession: () => void
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

export function AuthProvider({
  children,
  authService = createAuthService(),
}: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const modoAuth = getCraftAuthMode()
  const modoAuthLabel = obterModoAuthLabel()
  const officeId = sessaoLocalValida(session) ? obterOfficeIdDaSessao(session) : null

  const refreshSession = useCallback(() => {
    setSession(authService.getSession())
  }, [authService])

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    async function init() {
      try {
        if (deveUsarSupabaseAuth() && isSupabaseAuthService(authService)) {
          const supabase = getSupabaseClient()
          if (!supabase) {
            console.warn('[Craft Auth] Supabase indisponível — usando modo local.')
            const localSession = await inicializarSessaoLocal(createAuthService())
            if (!cancelled) setSession(localSession)
            return
          }

          const { data } = await supabase.auth.getSession()
          if (cancelled) return

          try {
            const resolved = await authService.resolveSessionFromSupabase(data.session)
            if (!cancelled) setSession(resolved)
          } catch (e) {
            console.error('[Craft Auth] Sessão Supabase inválida:', e)
            if (!cancelled) setSession(null)
          }

          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange(async (_event, sbSession) => {
            if (cancelled) return
            try {
              const resolved = await authService.resolveSessionFromSupabase(sbSession)
              setSession(resolved)
            } catch {
              setSession(null)
            }
          })

          unsubscribe = () => subscription.unsubscribe()
          return
        }

        const localSession = await inicializarSessaoLocal(authService)
        if (!cancelled) setSession(localSession)
      } catch (e) {
        console.error('[Craft Auth] Erro ao inicializar sessão:', e)
        if (!cancelled) setSession(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void init()

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [authService])

  const login = useCallback(
    async (input: LoginInput) => {
      const newSession = await authService.login(input)
      setSession(newSession)
      return newSession
    },
    [authService]
  )

  const logout = useCallback(async () => {
    await authService.logout()
    setSession(null)
  }, [authService])

  const register = useCallback(
    async (input: CadastroOficinaInput) => {
      const newSession = await authService.register(input)
      setSession(newSession)
    },
    [authService]
  )

  const requestPasswordReset = useCallback(
    async (email: string) => {
      await authService.requestPasswordReset(email)
    },
    [authService]
  )

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

  const value = useMemo(
    () => ({
      session,
      loading,
      modoAuth,
      modoAuthLabel,
      officeId,
      login,
      logout,
      register,
      requestPasswordReset,
      listarUsuarios,
      carregarUsuarios,
      criarUsuario,
      atualizarUsuario,
      excluirUsuario,
      refreshSession,
    }),
    [
      session,
      loading,
      modoAuth,
      modoAuthLabel,
      officeId,
      login,
      logout,
      register,
      requestPasswordReset,
      listarUsuarios,
      carregarUsuarios,
      criarUsuario,
      atualizarUsuario,
      excluirUsuario,
      refreshSession,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
