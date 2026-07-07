import { getCraftPersistenceMode } from '@/lib/supabase'
import { limparCachesComunicacaoOffice } from '@/services/comunicacao/comunicacao-cache-clear'
import { carregarAlertasComunicacaoRemoto } from '@/services/comunicacao/alertas-comunicacao-sync.service'
import { carregarHistoricoComunicacaoRemoto } from '@/services/comunicacao/comunicacao-sync.service'
import { carregarEstoqueRemoto } from '@/services/estoque/estoque-sync.service'
import { carregarComSupabase } from '@/services/repository/hybrid.repository'
import type { CraftDatabase } from '@/types'

export const SYNC_FORCADO_EVENTO = 'craft:sync-forcado'

function emitirSyncForcado(): void {
  window.dispatchEvent(new CustomEvent(SYNC_FORCADO_EVENTO))
}

export interface ResultadoForcarSincronizacao {
  ok: boolean
  database?: CraftDatabase
  mensagem?: string
}

/**
 * Limpa cache local de comunicação, recarrega Supabase (config + fase 1 + estoque + alertas + histórico).
 * Use quando dispositivos divergirem.
 */
export async function forcarSincronizacaoComServidor(
  officeId: string
): Promise<ResultadoForcarSincronizacao> {
  if (getCraftPersistenceMode() !== 'supabase') {
    return { ok: false, mensagem: 'Modo Supabase não está ativo.' }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, mensagem: 'Sem conexão com a internet.' }
  }

  limparCachesComunicacaoOffice(officeId)

  const [historico, alertas, estoque] = await Promise.all([
    carregarHistoricoComunicacaoRemoto(officeId),
    carregarAlertasComunicacaoRemoto(officeId),
    carregarEstoqueRemoto(officeId),
  ])

  const database = await carregarComSupabase(officeId, { silencioso: true })

  emitirSyncForcado()

  const ok = historico.ok || alertas.ok || estoque.ok || Boolean(database)
  return {
    ok,
    database,
    mensagem: ok ? undefined : 'Não foi possível sincronizar com o servidor.',
  }
}
