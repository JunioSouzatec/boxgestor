import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import { hybridCraftRepository } from '@/services/repository/hybrid.repository'
import { localCraftRepository } from '@/services/repository/local.repository'
import type { ICraftRepository } from '@/services/repository/types'

/**
 * Factory de repositório — localStorage ou Supabase experimental (fase 1).
 *
 * Modo supabase: entidades fase 1 no Postgres; demais dados permanecem no localStorage.
 * Fallback automático para local em caso de falha ou offline.
 */
export function createCraftRepository(): ICraftRepository {
  if (getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()) {
    return hybridCraftRepository
  }
  return localCraftRepository
}

export function isModoSupabaseExperimentalAtivo(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

export function getActivePersistenceLabel(): string {
  if (getCraftPersistenceMode() === 'supabase') {
    return isSupabaseConfigured() ? 'Supabase (experimental)' : 'Supabase (não configurado)'
  }
  return 'local'
}
