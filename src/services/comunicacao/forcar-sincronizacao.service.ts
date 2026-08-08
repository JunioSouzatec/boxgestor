import { getCraftPersistenceMode } from '@/lib/supabase'
import { MSG } from '@/lib/mensagens-usuario'
import { limparCachesComunicacaoOffice } from '@/services/comunicacao/comunicacao-cache-clear'
import { carregarAlertasComunicacaoRemoto } from '@/services/comunicacao/alertas-comunicacao-sync.service'
import { carregarHistoricoComunicacaoRemoto } from '@/services/comunicacao/comunicacao-sync.service'
import { pullEstoqueDoSupabase } from '@/services/estoque/estoque-sync.service'
import { sincronizarFotosPendentesOffline } from '@/services/os/offline-service-order-photos.service'
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
  fotosEnviadas?: number
  fotosFalhas?: number
}

/**
 * Publica pendências locais (fase1/OS/texto), recarrega do Supabase
 * e em seguida envia fotos pendentes do IndexedDB.
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

  try {
    const { publicarServicosCatalogoNoSupabase } = await import(
      '@/services/servicos/servico-catalogo-sync.service'
    )
    await publicarServicosCatalogoNoSupabase(officeId)
  } catch (err) {
    console.warn('[Craft Sync] Falha ao publicar catálogo de serviços:', err)
  }

  const [historico, alertas, estoque] = await Promise.all([
    carregarHistoricoComunicacaoRemoto(officeId),
    carregarAlertasComunicacaoRemoto(officeId),
    pullEstoqueDoSupabase(officeId),
  ])

  // 2) Pull + segundo flush pós-merge (OS remota precisa existir antes das fotos)
  const database = await carregarComSupabase(officeId, {
    silencioso: true,
    processarFilaAposPull: true,
  })

  // 3) Flush fotos pendentes (após OS remota)
  let fotosEnviadas = 0
  let fotosFalhas = 0
  let msgFotos: string | undefined
  try {
    const fotos = await sincronizarFotosPendentesOffline(officeId)
    fotosEnviadas = fotos.enviadas
    fotosFalhas = fotos.falhas + fotos.puladasOsRemota
    msgFotos = fotos.mensagem
  } catch (err) {
    console.warn('[Craft Sync] Falha ao sincronizar fotos pendentes:', err)
    fotosFalhas = 1
    msgFotos = MSG.fotosPendentesFalhaParcial
  }

  const pendentesRestantes = syncQueueService.contarPendentes(officeId)
  atualizarContagemPendenciasAtivas(officeId)

  emitirSyncForcado()

  const ok = historico.ok || alertas.ok || estoque.ok || Boolean(database)
  if (!ok) {
    return {
      ok: false,
      database,
      pendentesRestantes,
      fotosEnviadas,
      fotosFalhas,
      mensagem: 'Não foi possível sincronizar com o servidor.',
    }
  }

  if (pendentesRestantes > 0 || fotosFalhas > 0) {
    return {
      ok: true,
      database,
      pendentesRestantes: pendentesRestantes + fotosFalhas,
      fotosEnviadas,
      fotosFalhas,
      mensagem:
        msgFotos ||
        `Sincronização parcial: ainda há ${pendentesRestantes + fotosFalhas} pendência(s). Tente novamente.`,
    }
  }

  if (fotosEnviadas > 0) {
    return {
      ok: true,
      database,
      pendentesRestantes: 0,
      fotosEnviadas,
      fotosFalhas: 0,
      mensagem: MSG.fotosPendentesSincronizadas,
    }
  }

  return {
    ok: true,
    database,
    pendentesRestantes: 0,
    fotosEnviadas: 0,
    fotosFalhas: 0,
    mensagem: 'Dados sincronizados com o servidor.',
  }
}
