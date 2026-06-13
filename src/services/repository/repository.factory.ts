import { getCraftPersistenceMode } from '@/lib/supabase'
import { localCraftRepository } from '@/services/repository/local.repository'
import type { ICraftRepository } from '@/services/repository/types'

/**
 * Factory de repositório — ponto único para trocar localStorage → Supabase.
 *
 * Hoje: sempre retorna LocalCraftRepository (comportamento atual do app).
 * Futuro: quando VITE_CRAFT_PERSISTENCE=supabase e login estiver ativo,
 * retornar adaptador async ou sincronizar via SupabaseCraftRepository.
 */
export function createCraftRepository(): ICraftRepository {
  const mode = getCraftPersistenceMode()

  if (mode === 'supabase') {
    console.warn(
      '[Craft] Modo supabase solicitado, mas ainda não está ativo. ' +
        'Usando localStorage. Implemente SupabaseCraftRepository e login primeiro.'
    )
  }

  return localCraftRepository
}

export function getActivePersistenceLabel(): string {
  return getCraftPersistenceMode() === 'supabase' ? 'supabase (pendente)' : 'local'
}
