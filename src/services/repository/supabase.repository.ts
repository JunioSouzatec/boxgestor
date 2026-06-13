import type { CraftDatabase } from '@/types/database'
import type { ISupabaseCraftRepository } from '@/services/repository/types'
import { getSupabaseClient } from '@/lib/supabase'

/**
 * Repositório Supabase — implementação futura.
 * Não utilizado enquanto VITE_CRAFT_PERSISTENCE=local (padrão).
 *
 * Responsabilidades planejadas:
 * - carregar/salvar CraftDatabase por office_id
 * - mappers bidirecionais app ↔ tabelas SQL
 * - sync incremental (substituir snapshot monolítico)
 */
export class SupabaseCraftRepository implements ISupabaseCraftRepository {
  async carregar(_officeId: string): Promise<CraftDatabase> {
    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new Error(
        'SupabaseCraftRepository: cliente não configurado. Verifique .env.local'
      )
    }

    // TODO: implementar queries paralelas por tabela + mappers
    // const { data: customers } = await supabase.from('customers').select('*').eq('office_id', officeId)
    throw new Error(
      'SupabaseCraftRepository.carregar() ainda não implementado. Use persistência local.'
    )
  }

  async salvar(_officeId: string, _dados: CraftDatabase): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new Error(
        'SupabaseCraftRepository: cliente não configurado. Verifique .env.local'
      )
    }

    // TODO: upsert transacional por entidade
    throw new Error(
      'SupabaseCraftRepository.salvar() ainda não implementado. Use persistência local.'
    )
  }
}

export const supabaseCraftRepository = new SupabaseCraftRepository()
