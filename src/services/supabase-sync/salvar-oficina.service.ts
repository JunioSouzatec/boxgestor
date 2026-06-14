import { getCraftPersistenceMode } from '@/lib/supabase'
import { deveUsarSupabaseAuth } from '@/services/auth/auth.factory'
import {
  MENSAGEM_FALLBACK_OFICINA,
  MENSAGEM_SUCESSO_OFICINA_SUPABASE,
  persistirConfiguracaoOficinaNoSupabase,
} from '@/services/supabase-sync/supabase-office.persistence'
import { marcarPersistenciaSomenteOficina } from '@/services/supabase-sync/persistencia-opcoes'
import type { CraftDatabase } from '@/types/database'
import type { ConfiguracaoOficina } from '@/types/oficina'

export interface ResultadoSalvarDadosOficina {
  salvouSupabase: boolean
  mensagem: string
}

/**
 * Salva configuração localmente (via callback) e tenta persistir no Supabase
 * quando Auth + persistência Supabase estão ativos.
 */
export async function salvarDadosOficinaComSupabase(
  db: CraftDatabase,
  patch: Partial<ConfiguracaoOficina>,
  salvarLocal: (patch: Partial<ConfiguracaoOficina>) => void
): Promise<ResultadoSalvarDadosOficina> {
  marcarPersistenciaSomenteOficina()
  salvarLocal(patch)

  const configuracaoAtualizada: ConfiguracaoOficina = {
    ...db.configuracao,
    ...patch,
  }

  if (getCraftPersistenceMode() !== 'supabase' || !deveUsarSupabaseAuth()) {
    return {
      salvouSupabase: false,
      mensagem: 'Dados salvos localmente.',
    }
  }

  const resultado = await persistirConfiguracaoOficinaNoSupabase(
    configuracaoAtualizada,
    db.proximo_numero_os
  )

  return {
    salvouSupabase: resultado.salvouSupabase,
    mensagem: resultado.salvouSupabase
      ? MENSAGEM_SUCESSO_OFICINA_SUPABASE
      : MENSAGEM_FALLBACK_OFICINA,
  }
}

export { MENSAGEM_SUCESSO_OFICINA_SUPABASE, MENSAGEM_FALLBACK_OFICINA }
