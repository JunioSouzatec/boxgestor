import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { localAuthService } from '@/services/auth/local-auth.service'
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
  login: (input: LoginInput) => Promise<AuthSession>
  logout: () => Promise<void>
  register: (input: CadastroOficinaInput) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  listarUsuarios: () => AuthUser[]
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

export function AuthProvider({ children, authService = localAuthService }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshSession = useCallback(() => {
    setSession(authService.getSession())
  }, [authService])

  useEffect(() => {
    refreshSession()
    setLoading(false)
  }, [refreshSession])

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
      login,
      logout,
      register,
      requestPasswordReset,
      listarUsuarios,
      criarUsuario,
      atualizarUsuario,
      excluirUsuario,
      refreshSession,
    }),
    [
      session,
      loading,
      login,
      logout,
      register,
      requestPasswordReset,
      listarUsuarios,
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
