import { CadastroRequerConfirmacaoEmailError } from '@/lib/cadastro-errors'
import {
  ensureOfficeForUser,
  getCurrentProfile,
  getCurrentSupabaseUser,
} from '@/services/auth/supabase-auth-safe.service'
import type { CadastroOficinaInput } from '@/types/auth'

export interface CraftSignupMetadata {
  nome_oficina: string
  telefone: string
  whatsapp?: string
  cidade?: string
  estado?: string
  endereco?: string
  cnpj?: string
}

export function montarSignupMetadata(input: CadastroOficinaInput): CraftSignupMetadata {
  return {
    nome_oficina: input.nome_oficina.trim(),
    telefone: input.telefone.trim(),
    whatsapp: input.whatsapp?.trim() || input.telefone.trim(),
    cidade: input.cidade?.trim() || undefined,
    estado: input.estado?.trim() || undefined,
    endereco: input.endereco?.trim() || undefined,
    cnpj: input.cnpj?.trim() || undefined,
  }
}

export function lerSignupMetadata(raw: unknown): CraftSignupMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<CraftSignupMetadata>
  if (!data.nome_oficina?.trim() || !data.telefone?.trim()) return null
  return {
    nome_oficina: data.nome_oficina.trim(),
    telefone: data.telefone.trim(),
    whatsapp: data.whatsapp?.trim() || data.telefone.trim(),
    cidade: data.cidade?.trim() || undefined,
    estado: data.estado?.trim() || undefined,
    endereco: data.endereco?.trim() || undefined,
    cnpj: data.cnpj?.trim() || undefined,
  }
}

/** Após login com e-mail confirmado, cria oficina a partir dos metadados do cadastro público. */
export async function tentarFinalizarCadastroPublico(): Promise<boolean> {
  const user = await getCurrentSupabaseUser()
  if (!user) return false

  const signup = lerSignupMetadata(user.user_metadata?.craft_signup)
  if (!signup) return false

  const profile = await getCurrentProfile(user.id)
  if (profile?.office_id) return false

  const result = await ensureOfficeForUser({
    nome_oficina: signup.nome_oficina,
    telefone: signup.telefone,
    cidade: signup.cidade ?? '',
    estado: signup.estado ?? '',
    nome_responsavel:
      typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : undefined,
    email: user.email ?? undefined,
  })

  if (!result.ok || !result.officeId) return false

  return true
}

export function validarCadastroPublico(input: CadastroOficinaInput): void {
  if (!input.nome_responsavel.trim()) {
    throw new Error('Informe o nome do responsável.')
  }
  if (!input.email.trim()) {
    throw new Error('Informe o e-mail.')
  }
  if (!input.senha.trim()) {
    throw new Error('Informe a senha.')
  }
  if (!input.nome_oficina.trim()) {
    throw new Error('Informe o nome da oficina.')
  }
  if (!input.telefone.trim()) {
    throw new Error('Informe telefone ou WhatsApp.')
  }
  if (!input.cidade?.trim() || !input.estado?.trim()) {
    throw new Error('Informe cidade e estado da oficina.')
  }
  if (input.senha.length < 6) {
    throw new Error('A senha deve ter pelo menos 6 caracteres.')
  }
}

export function lancarSeRequerConfirmacaoEmail(
  session: { access_token?: string } | null | undefined,
  email: string
): void {
  if (!session?.access_token) {
    throw new CadastroRequerConfirmacaoEmailError(email)
  }
}
