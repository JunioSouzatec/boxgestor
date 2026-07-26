import { getCraftPersistenceMode } from '@/lib/supabase'
import { limparCachesComunicacaoOffice } from '@/services/comunicacao/comunicacao-cache-clear'
import { carregarAlertasComunicacaoRemoto } from '@/services/comunicacao/alertas-comunicacao-sync.service'
import { carregarHistoricoComunicacaoRemoto } from '@/services/comunicacao/comunicacao-sync.service'
import { pullEstoqueDoSupabase } from '@/services/estoque/estoque-sync.service'
import { atualizarContagemPendenciasAtivas } from '@/services/persistence-status.events'
import {
  carregarComSupabase,
  processarFilaSyncPendente,
} from '@/services/repository/hybrid.repository'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import type { CraftDatabase } from '@/types'

export const SYNC_FORCADO_EVENTO = 'craft:sync-forcado'

function emitirSyncForcado(): void {
  window.dispatchEvent(new CustomEvent(SYNC_FORCADO_EVENTO))
}

export interface ResultadoForcarSincronizacao {
  ok: boolean
  database?: CraftDatabase
  mensagem?: string
  pendentesRestantes?: number
}

/**
 * Publica pendências locais (fase1/OS/texto) e recarrega do Supabase.
 * Caminho confiável no celular quando o evento `online` falha.
 */
export async function forcarSincronizacaoComServidor(
  officeId: string
): Promise<ResultadoForcarSincronizacao> {
  if (getCraftPersistenceMode() !== 'supabase') {
    return { ok: false, mensagem: 'Modo Supabase não está ativo.' }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      mensagem: 'Sem conexão com a internet. Conecte-se para sincronizar.',
    }
  }

  // 1) Flush da fila de texto antes do pull
  try {
    await processarFilaSyncPendente(officeId)
  } catch (err) {
    console.warn('[Craft Sync] Falha ao processar fila pendente:', err)
  }

  try {
    const { processarFilaClientesPendente } = await import(
      '@/services/clientes/cliente-update-supabase.service'
    )
    await processarFilaClientesPendente(officeId)
  } catch {
    /* segue */
  }

  try {
    const { processarFilaVeiculosPendente } = await import(
      '@/services/veiculos/veiculo-update-supabase.service'
    )
    await processarFilaVeiculosPendente(officeId)
  } catch {
    /* segue */
  }

  limparCachesComunicacaoOffice(officeId)

  const [historico, alertas, estoque] = await Promise.all([
    carregarHistoricoComunicacaoRemoto(officeId),
    carregarAlertasComunicacaoRemoto(officeId),
    pullEstoqueDoSupabase(officeId),
  ])

  // 2) Pull + segundo flush pós-merge
  const database = await carregarComSupabase(officeId, {
    silencioso: true,
    processarFilaAposPull: true,
  })

  const pendentesRestantes = syncQueueService.contarPendentes(officeId)
  atualizarContagemPendenciasAtivas(officeId)

  emitirSyncForcado()

  const ok = historico.ok || alertas.ok || estoque.ok || Boolean(database)
  if (!ok) {
    return {
      ok: false,
      database,
      pendentesRestantes,
      mensagem: 'Não foi possível sincronizar com o servidor.',
    }
  }

  if (pendentesRestantes > 0) {
    return {
      ok: true,
      database,
      pendentesRestantes,
      mensagem: `Sincronização parcial: ainda há ${pendentesRestantes} pendência(s). Tente novamente.`,
    }
  }

  return {
    ok: true,
    database,
    pendentesRestantes: 0,
    mensagem: 'Dados sincronizados com o servidor.',
  }
}
