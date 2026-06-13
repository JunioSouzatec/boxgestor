import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getCraftAuthMode, obterModoAuthLabel, isModoAuthSupabaseAtivo } from '@/lib/craft-auth'
import { getSupabaseClient } from '@/lib/supabase'
import {
  createAuthService,
  isSupabaseAuthService,
} from '@/services/auth/auth.factory'
import { supabaseAuthService } from '@/services/auth/supabase-auth.service'
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

export function AuthProvider({
  children,
  authService = createAuthService(),
}: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const modoAuth = getCraftAuthMode()
  const modoAuthLabel = obterModoAuthLabel()

  const refreshSession = useCallback(() => {
    setSession(authService.getSession())
  }, [authService])

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    async function init() {
      if (isModoAuthSupabaseAtivo() && isSupabaseAuthService(authService)) {
        const supabase = getSupabaseClient()
        if (!supabase) {
          if (!cancelled) setLoading(false)
          return
        }

        const { data } = await supabase.auth.getSession()
        if (cancelled) return

        try {
          const resolved = await authService.resolveSessionFromSupabase(data.session)
          if (!cancelled) setSession(resolved)
        } catch (e) {
          console.error('[Craft Auth] Sessão inválida:', e)
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
        if (!cancelled) setLoading(false)
        return
      }

      refreshSession()
      if (!cancelled) setLoading(false)
    }

    void init()

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [authService, refreshSession])

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
    if (!session) return []
    return authService.listarUsuariosOficina(session.user.office_id)
  }, [authService, session])

  const carregarUsuarios = useCallback(async () => {
    if (!session) return []
    if (isSupabaseAuthService(authService)) {
      return authService.listarUsuariosOficinaAsync(session.user.office_id)
    }
    return authService.listarUsuariosOficina(session.user.office_id)
  }, [authService, session])

  const criarUsuario = useCallback(
    async (input: UsuarioInput) => {
      if (!session) throw new Error('Sessão expirada.')
      const user = await authService.criarUsuario(session.user, input)
      refreshSession()
      return user
    },
    [authService, session, refreshSession]
  )

  const atualizarUsuario = useCallback(
    async (userId: string, patch: UsuarioUpdateInput) => {
      if (!session) throw new Error('Sessão expirada.')
      const user = await authService.atualizarUsuario(session.user, userId, patch)
      refreshSession()
      return user
    },
    [authService, session, refreshSession]
  )

  const excluirUsuario = useCallback(
    async (userId: string) => {
      if (!session) throw new Error('Sessão expirada.')
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

export { supabaseAuthService }
