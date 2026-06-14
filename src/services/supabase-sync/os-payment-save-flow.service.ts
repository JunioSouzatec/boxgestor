import { ehProvavelErroDeRede } from '@/lib/network-error'
import { MSG, logDetalheTecnicoDev } from '@/lib/mensagens-usuario'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { atualizarContagemPendenciasAtivas, emitirEventoPersistencia } from '@/services/persistence-status.events'
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

export async function sincronizarPagamentoNoSupabase(
  officeLocalId: string,
  lancamentoId: string
): Promise<ResultadoSyncPagamentoOs> {
  if (getCraftPersistenceMode() !== 'supabase') {
    return { ok: true, mensagem: MSG.pagamentoRegistrado }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: true, mensagem: MSG.semConexao, offline: true }
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
    return {
      ok: offline,
      mensagem: offline ? MSG.semConexao : MSG.erroSalvar,
      offline,
    }
  }

  if (
    resultado.correcoes_os.length > 0 ||
    resultado.sync_atualizados.length > 0 ||
    (resultado.orfaos_marcados?.length ?? 0) > 0
  ) {
    const atualizado = aplicarResultadoSyncPagamentosLocal(dados, resultado)
    marcarPularPersistenciaRemotaProxima()
    localCraftRepository.salvar(officeLocalId, atualizado)
  }

  const sincronizado =
    resultado.ok ||
    resultado.sincronizados_ids.includes(lancamentoId) ||
    resultado.duplicatas_evitadas_ids.includes(lancamentoId)

  if (sincronizado) {
    syncQueueService.marcarSincronizadosPorEntidade(officeLocalId, 'lancamento', lancamentoId)
    atualizarContagemPendenciasAtivas(officeLocalId)
    emitirEventoPersistencia({ type: 'supabase_ok' })
    return { ok: true, mensagem: MSG.pagamentoRegistrado }
  }

  const erroMsg = resultado.erros[0]?.mensagem
  const offline = ehProvavelErroDeRede(erroMsg)
  logDetalheTecnicoDev('pagamento sync falhou', resultado.erros)

  if (offline) {
    syncQueueService.enfileirar({
      office_id: officeLocalId,
      tipo_acao: 'update',
      entidade: 'lancamento',
      entidade_id: lancamentoId,
    })
    atualizarContagemPendenciasAtivas(officeLocalId)
    return { ok: true, mensagem: MSG.semConexao, offline: true }
  }

  return { ok: false, mensagem: MSG.erroSalvar }
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
