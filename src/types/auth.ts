/** Papéis do usuário no Craft SaaS */
export type PapelUsuario = 'dono' | 'gerente' | 'mecanico' | 'recepcao'

export interface AuthUser {
  id: string
  email: string
  nome: string
  office_id: string
  papel: PapelUsuario
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface AuthSession {
  user: AuthUser
  access_token: string
  expires_at: string
}

export interface CadastroOficinaInput {
  nome_responsavel: string
  email: string
  senha: string
  nome_oficina: string
  endereco: string
  telefone: string
  cnpj?: string
}

export interface LoginInput {
  email: string
  senha: string
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
}

export const PAPEIS_USUARIO: { value: PapelUsuario; label: string }[] = [
  { value: 'dono', label: 'Dono' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'mecanico', label: 'Mecânico' },
  { value: 'recepcao', label: 'Recepção' },
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
