import { logDetalheTecnicoDev } from '@/lib/mensagens-usuario'
import {
  atualizarCacheContagemFotosPendentes,
  getCachedContagemFotosPendentes,
} from '@/services/os/offline-service-order-photos.service'
import {
  getActiveSyncPendingCount,
  obterResumoPendenciasPagamentosSync,
  reconciliarFilaSyncComPendenciasAtivas,
} from '@/services/pagamentos/payment-pending-diagnostic.service'
import { operacaoSalvamentoExplicitoAtiva } from '@/services/supabase-sync/persistencia-opcoes'
import { syncQueueService } from '@/services/sync/sync-queue.service'

export type EscopoFallbackPersistencia = 'geral' | 'pagamento' | 'os'

export type PersistenceStatusEvent =
  | { type: 'supabase_ok' }
  | { type: 'pagamento_ok'; mensagem: string }
  | {
      type: 'pagamentos_pendentes'
      mensagem: string
      pendentes: number
      vinculo_os?: boolean
    }
  | { type: 'fallback'; mensagem: string; escopo?: EscopoFallbackPersistencia }
  | { type: 'offline'; mensagem: string }
  | { type: 'fila_atualizada'; pendentes: number; vinculo_os?: boolean }
  | { type: 'diagnostico_pendencias_atualizado'; pendentes: number; vinculo_os: boolean }

type Listener = (event: PersistenceStatusEvent) => void

const listeners = new Set<Listener>()

function deveSuprimirEventoDuranteSaveExplicito(event: PersistenceStatusEvent): boolean {
  if (!operacaoSalvamentoExplicitoAtiva()) return false
  return (
    event.type === 'fallback' ||
    event.type === 'offline' ||
    event.type === 'pagamentos_pendentes'
  )
}

export function emitirEventoPersistencia(event: PersistenceStatusEvent): void {
  if (deveSuprimirEventoDuranteSaveExplicito(event)) {
    logDetalheTecnicoDev('evento persistência suprimido', event)
    return
  }
  listeners.forEach((fn) => fn(event))
}

export function inscreverEventosPersistencia(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export { getActiveSyncPendingCount, reconciliarFilaSyncComPendenciasAtivas }

/** Contador unificado — mesma origem da lista de diagnóstico */
export function contarPagamentosPendentesTotais(officeId: string): {
  total: number
  vinculoOs: number
} {
  const resumo = obterResumoPendenciasPagamentosSync(officeId)
  return { total: resumo.total, vinculoOs: resumo.vinculoOs > 0 ? resumo.vinculoOs : 0 }
}

function emitirContagemPendencias(
  totalVisivel: number,
  vinculoOs: boolean,
  filaBruta: number
): { total: number; vinculoOs: number; filaBruta: number } {
  emitirEventoPersistencia({
    type: 'diagnostico_pendencias_atualizado',
    pendentes: totalVisivel,
    vinculo_os: vinculoOs,
  })
  emitirEventoPersistencia({
    type: 'fila_atualizada',
    pendentes: totalVisivel,
    vinculo_os: vinculoOs,
  })

  if (totalVisivel === 0) {
    emitirEventoPersistencia({ type: 'supabase_ok' })
  }

  return {
    total: totalVisivel,
    vinculoOs: vinculoOs ? 1 : 0,
    filaBruta,
  }
}

/** Reconcilia fila, recalcula pendências ativas e notifica topo + telas */
export function atualizarContagemPendenciasAtivas(officeId: string): {
  total: number
  vinculoOs: number
  filaBruta: number
} {
  reconciliarFilaSyncComPendenciasAtivas(officeId)
  const resumo = obterResumoPendenciasPagamentosSync(officeId)
  const filaBruta = syncQueueService.contarPendentes(officeId)
  const fotosPendentes = getCachedContagemFotosPendentes(officeId)
  // Inclui fila de texto (fase1/OS) + pagamentos + fotos IndexedDB.
  const totalVisivel = Math.max(resumo.total, filaBruta) + fotosPendentes
  const resultado = emitirContagemPendencias(
    totalVisivel,
    resumo.vinculoOs > 0,
    filaBruta
  )

  // Atualiza cache async de fotos e reemite se mudou
  void atualizarCacheContagemFotosPendentes(officeId).then((n) => {
    if (n === fotosPendentes) return
    const totalNovo = Math.max(resumo.total, filaBruta) + n
    emitirContagemPendencias(totalNovo, resumo.vinculoOs > 0, filaBruta)
  })

  return resultado
}

export function emitirDiagnosticoPendenciasAtualizado(officeId: string): {
  total: number
  vinculoOs: number
} {
  const { total, vinculoOs } = atualizarContagemPendenciasAtivas(officeId)
  return { total, vinculoOs }
}
