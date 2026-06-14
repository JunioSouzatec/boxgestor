import { logDetalheTecnicoDev } from '@/lib/mensagens-usuario'
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

/** Reconcilia fila, recalcula pendências ativas e notifica topo + telas */
export function atualizarContagemPendenciasAtivas(officeId: string): {
  total: number
  vinculoOs: number
  filaBruta: number
} {
  reconciliarFilaSyncComPendenciasAtivas(officeId)
  const resumo = obterResumoPendenciasPagamentosSync(officeId)
  const filaBruta = syncQueueService.contarPendentes(officeId)

  emitirEventoPersistencia({
    type: 'diagnostico_pendencias_atualizado',
    pendentes: resumo.total,
    vinculo_os: resumo.vinculoOs > 0,
  })
  emitirEventoPersistencia({
    type: 'fila_atualizada',
    pendentes: resumo.total,
    vinculo_os: resumo.vinculoOs > 0,
  })

  if (resumo.total === 0) {
    emitirEventoPersistencia({ type: 'supabase_ok' })
  }

  return { total: resumo.total, vinculoOs: resumo.vinculoOs, filaBruta }
}

export function emitirDiagnosticoPendenciasAtualizado(officeId: string): {
  total: number
  vinculoOs: number
} {
  const { total, vinculoOs } = atualizarContagemPendenciasAtivas(officeId)
  return { total, vinculoOs }
}
