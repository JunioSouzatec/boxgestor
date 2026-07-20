/** Papéis do usuário no Craft SaaS */
export type PapelUsuario = 'dono' | 'gerente' | 'mecanico' | 'recepcao'

export interface AuthUser {
  id: string
  email: string
  nome: string
  office_id: string
  papel: PapelUsuario
  ativo: boolean
  /** Login interno (ex.: mecanico01) — sem e-mail pessoal */
  login_username?: string
  /** Conta criada pelo dono com e-mail técnico @*.boxgestor.local */
  interno?: boolean
  /** Slug da oficina usado no e-mail técnico */
  office_slug?: string
  /** Solicitar troca de senha no próximo acesso */
  must_change_password?: boolean
  created_by?: string
  /** Último acesso conhecido (ISO) */
  last_sign_in_at?: string
  /** Administrador do Sistema BoxGestor (suporte/técnico) — não confundir com Dono da oficina */
  admin_sistema?: boolean
  created_at: string
  updated_at: string
}

export interface AuthSession {
  user: AuthUser
  access_token: string
  /** Refresh token Supabase — usado para rehidratar o client se getSession falhar */
  refresh_token?: string
  expires_at: string
}

export interface CadastroOficinaInput {
  nome_responsavel: string
  email: string
  senha: string
  nome_oficina: string
  /** Logradouro completo (modo local) */
  endereco?: string
  telefone: string
  whatsapp?: string
  cidade?: string
  estado?: string
  cnpj?: string
}

export interface LoginInput {
  /** E-mail real, e-mail interno completo ou login interno (ex.: mecanico01) */
  email: string
  senha: string
  /** Código/slug da oficina — necessário se o login existir em mais de uma oficina */
  codigo_oficina?: string
}

export interface UsuarioInternoInput {
  nome: string
  login_username: string
  senha: string
  papel: PapelUsuario
  ativo: boolean
}

export interface UsuarioInput {
  nome: string
  email: string
  senha: string
  papel: PapelUsuario
  ativo: boolean
}

export interface UsuarioUpdateInput {
  nome?: string
  email?: string
  senha?: string
  papel?: PapelUsuario
  ativo?: boolean
  must_change_password?: boolean
}

export const PAPEIS_USUARIO: { value: PapelUsuario; label: string }[] = [
  { value: 'dono', label: 'Dono' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'mecanico', label: 'Mecânico' },
  { value: 'recepcao', label: 'Atendente' },
]

export function getLabelPapel(papel: PapelUsuario): string {
  return PAPEIS_USUARIO.find((p) => p.value === papel)?.label ?? papel
}

/** Mapeamento futuro → Supabase profile_role */
export const PAPEL_SUPABASE_MAP: Record<PapelUsuario, string> = {
  dono: 'owner',
  gerente: 'admin',
  mecanico: 'mecanico',
  recepcao: 'recepcionista',
}
