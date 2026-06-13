import type {
  AuthSession,
  AuthUser,
  CadastroOficinaInput,
  LoginInput,
  UsuarioInput,
  UsuarioUpdateInput,
} from '@/types/auth'

/** Contrato preparado para Supabase Auth */
export interface IAuthService {
  getSession(): AuthSession | null
  login(input: LoginInput): Promise<AuthSession>
  logout(): Promise<void>
  register(input: CadastroOficinaInput): Promise<AuthSession>
  requestPasswordReset(email: string): Promise<void>
  listarUsuariosOficina(officeId: string): AuthUser[]
  criarUsuario(requester: AuthUser, input: UsuarioInput): Promise<AuthUser>
  atualizarUsuario(
    requester: AuthUser,
    userId: string,
    patch: UsuarioUpdateInput
  ): Promise<AuthUser>
  excluirUsuario(requester: AuthUser, userId: string): Promise<void>
}
