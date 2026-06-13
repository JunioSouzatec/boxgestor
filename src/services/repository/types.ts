import type { CraftDatabase } from '@/types/database'

/**
 * Contrato de persistência síncrona — implementação local atual.
 * Todas as operações são escopadas por office_id (multi-oficina).
 */
export interface ICraftRepository {
  carregar(officeId: string): CraftDatabase
  salvar(officeId: string, dados: CraftDatabase): void
  resetar(officeId: string): CraftDatabase
}

/**
 * Contrato de persistência remota — Supabase (futuro).
 */
export interface ISupabaseCraftRepository {
  carregar(officeId: string): Promise<CraftDatabase>
  salvar(officeId: string, dados: CraftDatabase): Promise<void>
}

export type CraftRepositoryKind = 'local' | 'supabase'
