import type { AuthUser, PapelUsuario } from '@/types/auth'
import { enriquecerUsuarioAdmin } from '@/lib/craft-admin'
import { PAPEL_SUPABASE_MAP } from '@/types/auth'

export interface ProfileRow {
  id: string
  office_id: string
  full_name: string
  role: string
  email?: string | null
  active?: boolean | null
  created_at: string
  updated_at: string
}

const SUPABASE_PAPEL_MAP: Record<string, PapelUsuario> = {
  owner: 'dono',
  admin: 'gerente',
  mecanico: 'mecanico',
  recepcionista: 'recepcao',
}

export function papelParaSupabaseRole(papel: PapelUsuario): string {
  return PAPEL_SUPABASE_MAP[papel]
}

export function supabaseRoleParaPapel(role: string): PapelUsuario {
  return SUPABASE_PAPEL_MAP[role] ?? 'recepcao'
}

export function profileParaAuthUser(
  profile: ProfileRow,
  emailFallback: string
): AuthUser {
  return enriquecerUsuarioAdmin({
    id: profile.id,
    email: profile.email?.trim() || emailFallback,
    nome: profile.full_name?.trim() || 'Usuário',
    office_id: profile.office_id,
    papel: supabaseRoleParaPapel(profile.role),
    ativo: profile.active ?? true,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  })
}

export function traduzirErroAuth(mensagem: string): string {
  const m = mensagem.toLowerCase()
  if (m.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.'
  }
  if (m.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'
  }
  if (m.includes('user already registered')) {
    return 'Este e-mail já possui cadastro. Faça login para continuar.'
  }
  if (m.includes('password should be at least')) {
    return 'A senha deve ter pelo menos 6 caracteres.'
  }
  if (m.includes('rate limit')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  }
  return mensagem
}
