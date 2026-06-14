import { isUuidFormato } from '@/lib/local-id-uuid'
import { deveUsarSupabaseAuth } from '@/services/auth/auth.factory'
import {
  getCurrentProfile,
  getCurrentSupabaseSession,
} from '@/services/auth/supabase-auth-safe.service'
import type { OpcoesPersistenciaFase1 } from '@/services/supabase-sync/supabase-phase1.persistence'
import type { DadosSyncFase1 } from '@/services/supabase-sync/mappers'

export interface ContextoOfficeSupabase {
  officeUuid: string
  opcoes: OpcoesPersistenciaFase1
}

/**
 * Resolve office_id real do usuário logado (profile.office_id) para persistência Supabase.
 * Em modo local/demo, usa o id local ou UUID passado como fallback.
 */
export async function obterContextoOfficeSupabase(
  officeIdFallback: string
): Promise<ContextoOfficeSupabase | null> {
  if (deveUsarSupabaseAuth()) {
    const session = await getCurrentSupabaseSession()
    if (!session?.user?.id) {
      console.warn('[Craft Supabase] Sem sessão Auth — persistência remota ignorada.')
      return null
    }

    const profile = await getCurrentProfile(session.user.id)
    const officeUuid = profile?.office_id?.trim()

    if (!officeUuid) {
      console.warn('[Craft Supabase] Profile sem office_id — persistência remota ignorada.')
      return null
    }

    return {
      officeUuid,
      opcoes: {
        officeUuidDestino: officeUuid,
        usarOficinaExistente: true,
      },
    }
  }

  const trimmed = officeIdFallback.trim()
  if (isUuidFormato(trimmed)) {
    return {
      officeUuid: trimmed,
      opcoes: { officeUuidDestino: trimmed, usarOficinaExistente: true },
    }
  }

  return {
    officeUuid: trimmed,
    opcoes: {},
  }
}

/** Garante que dados fase 1 usam o UUID real da oficina no Supabase Auth */
export function aplicarOfficeUuidEmDadosFase1(
  dados: DadosSyncFase1,
  officeUuid: string
): DadosSyncFase1 {
  return {
    ...dados,
    configuracao: {
      ...dados.configuracao,
      id: officeUuid,
      office_id: officeUuid,
      oficina_id: officeUuid,
    },
  }
}
