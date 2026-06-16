import { ehProvavelErroDeRede } from '@/lib/network-error'
import { MSG, logDetalheTecnicoDev } from '@/lib/mensagens-usuario'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { obterClientPaymentId } from '@/services/pagamentos/payment-dedupe.helpers'
import { registrarAuditoriaSyncPendencia } from '@/services/pagamentos/payment-sync-audit.storage'
import {
  atualizarContagemPendenciasAtivas,
  emitirEventoPersistencia,
} from '@/services/persistence-status.events'
import { localCraftRepository } from '@/services/repository/local.repository'
import {
  marcarLancamentosRecentes,
  marcarPularPersistenciaRemotaProxima,
} from '@/services/supabase-sync/persistencia-opcoes'
import {
  aplicarResultadoSyncPagamentosLocal,
  persistirPagamentosNoSupabase,
} from '@/services/supabase-sync/supabase-payments.persistence'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import type { LancamentoFinanceiro } from '@/types/financeiro'

export interface ResultadoSyncPagamentoOs {
  ok: boolean
  mensagem: string
  offline?: boolean
}

function confirmarLancamentoSincronizadoLocal(
  lancamentoId: string,
  dados: ReturnType<typeof localCraftRepository.carregar>,
  paymentSupabaseId?: string
) {
  return {
    ...dados,
    lancamentos: dados.lancamentos.map((l) => {
      if (l.id !== lancamentoId) return l
      return {
        ...l,
        payment_supabase_id: paymentSupabaseId ?? l.payment_supabase_id,
        client_payment_id: obterClientPaymentId(l),
        sync_pendente: false,
        sync_orfao: false,
        sync_orfao_motivo: undefined,
      }
    }),
  }
}

export async function sincronizarPagamentoNoSupabase(
  officeLocalId: string,
  lancamentoId: string
): Promise<ResultadoSyncPagamentoOs> {
  if (getCraftPersistenceMode() !== 'supabase') {
    return { ok: true, mensagem: MSG.pagamentoRegistrado }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    registrarAuditoriaSyncPendencia({
      acao: 'criada',
      lancamento_id: lancamentoId,
      motivo: 'Sem conexão ao registrar pagamento',
    })
    return { ok: true, mensagem: MSG.pagamentoNaoEnviadoServidor, offline: true }
  }

  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  if (!contexto?.officeUuid) {
    logDetalheTecnicoDev('pagamento sync — sem office_id', { officeLocalId, lancamentoId })
    return { ok: false, mensagem: MSG.erroSalvar }
  }

  const dados = localCraftRepository.carregar(officeLocalId)
  const lancamento = dados.lancamentos.find((l) => l.id === lancamentoId)
  if (!lancamento) {
    return { ok: false, mensagem: MSG.erroSalvar }
  }

  marcarLancamentosRecentes([lancamentoId])

  let resultado: Awaited<ReturnType<typeof persistirPagamentosNoSupabase>>
  try {
    resultado = await persistirPagamentosNoSupabase(officeLocalId, dados, {
      officeUuid: contexto.officeUuid,
      createdBy: contexto.userId,
      lancamentoIds: [lancamentoId],
    })
  } catch (err) {
    logDetalheTecnicoDev('pagamento sync exception', err)
    const offline = ehProvavelErroDeRede(undefined, err)
    const erroTecnico = err instanceof Error ? err.message : String(err)
    registrarAuditoriaSyncPendencia({
      acao: offline ? 'criada' : 'falha_sync',
      lancamento_id: lancamentoId,
      motivo: offline ? 'Falha de conexão ao salvar' : 'Erro ao enviar pagamento ao Supabase',
      erro_tecnico: erroTecnico,
    })
    if (offline) {
      marcarPendenciaLocalFalhaReal(officeLocalId, lancamentoId)
    }
    return {
      ok: offline,
      mensagem: offline ? MSG.pagamentoNaoEnviadoServidor : MSG.erroSalvar,
      offline,
    }
  }

  const sincronizado =
    resultado.ok ||
    resultado.sincronizados_ids.includes(lancamentoId) ||
    resultado.duplicatas_evitadas_ids.includes(lancamentoId)

  if (sincronizado) {
    let atualizado = aplicarResultadoSyncPagamentosLocal(
      localCraftRepository.carregar(officeLocalId),
      resultado
    )
    const posSync = atualizado.lancamentos.find((l) => l.id === lancamentoId)
    if (posSync?.sync_pendente || !posSync?.payment_supabase_id) {
      const paymentId =
        resultado.sync_atualizados.find((s) => s.lancamento_id === lancamentoId)
          ?.payment_supabase_id ?? posSync?.payment_supabase_id
      atualizado = confirmarLancamentoSincronizadoLocal(
        lancamentoId,
        atualizado,
        paymentId
      )
    }
    marcarPularPersistenciaRemotaProxima()
    localCraftRepository.salvar(officeLocalId, atualizado)
    syncQueueService.marcarSincronizadosPorEntidade(officeLocalId, 'lancamento', lancamentoId)
    atualizarContagemPendenciasAtivas(officeLocalId)
    emitirEventoPersistencia({ type: 'supabase_ok' })
    return { ok: true, mensagem: MSG.pagamentoRegistrado }
  }

  const erroMsg = resultado.erros[0]?.mensagem
  const offline = ehProvavelErroDeRede(erroMsg)
  logDetalheTecnicoDev('pagamento sync falhou', resultado.erros)
  registrarAuditoriaSyncPendencia({
    acao: offline ? 'criada' : 'falha_sync',
    lancamento_id: lancamentoId,
    motivo: offline ? 'Falha de conexão ao salvar' : (erroMsg ?? 'Erro ao salvar no Supabase'),
    erro_tecnico: erroMsg,
  })

  if (offline) {
    marcarPendenciaLocalFalhaReal(officeLocalId, lancamentoId)
    return { ok: true, mensagem: MSG.pagamentoNaoEnviadoServidor, offline: true }
  }

  return { ok: false, mensagem: MSG.erroSalvar }
}

function marcarPendenciaLocalFalhaReal(officeLocalId: string, lancamentoId: string): void {
  const base = localCraftRepository.carregar(officeLocalId)
  const atualizado = {
    ...base,
    lancamentos: base.lancamentos.map((l) =>
      l.id === lancamentoId ? { ...l, sync_pendente: true } : l
    ),
  }
  marcarPularPersistenciaRemotaProxima()
  localCraftRepository.salvar(officeLocalId, atualizado)
  syncQueueService.enfileirar({
    office_id: officeLocalId,
    tipo_acao: 'update',
    entidade: 'lancamento',
    entidade_id: lancamentoId,
  })
  atualizarContagemPendenciasAtivas(officeLocalId)
}

export function obterUltimoLancamentoOs(
  lancamentos: LancamentoFinanceiro[],
  osId: string,
  antesIds: Set<string>
): LancamentoFinanceiro | undefined {
  return lancamentos
    .filter((l) => l.ordem_servico_id === osId && !antesIds.has(l.id))
    .sort((a, b) => b.id.localeCompare(a.id))[0]
}
