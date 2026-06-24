import { MSG } from '@/lib/mensagens-usuario'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { deveUsarSupabaseAuth } from '@/services/auth/auth.factory'
import { emitirEventoPersistencia } from '@/services/persistence-status.events'
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
  configuracao?: ConfiguracaoOficina
}

/**
 * Salva configuração localmente (via callback) e persiste no Supabase
 * quando Auth + persistência Supabase estão ativos.
 * Só retorna salvouSupabase=true após confirmação do Supabase.
 */
export async function salvarDadosOficinaComSupabase(
  db: CraftDatabase,
  patch: Partial<ConfiguracaoOficina>,
  salvarLocal: (patch: Partial<ConfiguracaoOficina>) => void
): Promise<ResultadoSalvarDadosOficina> {
  marcarPersistenciaSomenteOficina()

  const { tipo_oficina: _tipoIgnorado, ...patchSemTipo } = patch
  const configuracaoOtimista: ConfiguracaoOficina = {
    ...db.configuracao,
    ...patchSemTipo,
    tipo_oficina: db.configuracao.tipo_oficina,
    updated_at: new Date().toISOString(),
  }
  salvarLocal(configuracaoOtimista)

  if (getCraftPersistenceMode() !== 'supabase' || !deveUsarSupabaseAuth()) {
    return {
      salvouSupabase: false,
      mensagem: MSG.dadosSalvos,
    }
  }

  const resultado = await persistirConfiguracaoOficinaNoSupabase(
    configuracaoOtimista,
    db.proximo_numero_os
  )

  if (resultado.salvouSupabase && resultado.configuracao) {
    salvarLocal(resultado.configuracao)
    emitirEventoPersistencia({ type: 'supabase_ok' })
    return {
      salvouSupabase: true,
      mensagem: MENSAGEM_SUCESSO_OFICINA_SUPABASE,
      configuracao: resultado.configuracao,
    }
  }

  return {
    salvouSupabase: false,
    mensagem: resultado.mensagem || MENSAGEM_FALLBACK_OFICINA,
  }
}

export { MENSAGEM_SUCESSO_OFICINA_SUPABASE, MENSAGEM_FALLBACK_OFICINA }
