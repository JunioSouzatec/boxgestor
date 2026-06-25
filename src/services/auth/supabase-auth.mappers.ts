import {
  ehEmailInternoBoxGestor,
  extrairLoginDeEmailInterno,
} from '@/lib/internal-user'
import { enriquecerUsuarioAdmin } from '@/lib/craft-admin'
import { PAPEL_SUPABASE_MAP, type AuthUser, type PapelUsuario } from '@/types/auth'

export interface ProfileRow {
  id: string
  office_id: string
  full_name: string
  role: string
  email?: string | null
  active?: boolean | null
  login_username?: string | null
  is_internal?: boolean | null
  office_slug?: string | null
  must_change_password?: boolean | null
  created_by?: string | null
  last_sign_in_at?: string | null
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
  const email = profile.email?.trim() || emailFallback
  const interno = profile.is_internal === true || ehEmailInternoBoxGestor(email)
  return enriquecerUsuarioAdmin({
    id: profile.id,
    email,
    nome: profile.full_name?.trim() || 'Usuário',
    office_id: profile.office_id,
    papel: supabaseRoleParaPapel(profile.role),
    ativo: profile.active ?? true,
    login_username:
      profile.login_username?.trim() ||
      (interno ? extrairLoginDeEmailInterno(email) ?? undefined : undefined),
    interno,
    office_slug: profile.office_slug?.trim() || undefined,
    must_change_password: profile.must_change_password ?? false,
    created_by: profile.created_by ?? undefined,
    last_sign_in_at: profile.last_sign_in_at ?? undefined,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  })
}

export function traduzirErroAuth(mensagem: string): string {
  const m = mensagem.toLowerCase()
  if (m.includes('invalid login credentials')) {
    return 'Usuário/e-mail ou senha incorretos.'
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
