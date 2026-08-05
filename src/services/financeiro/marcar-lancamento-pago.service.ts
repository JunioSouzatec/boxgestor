/**
 * Marca despesa/receita geral como paga e persiste no Supabase.
 * Monta o objeto pago antes de salvar (sem race de setState).
 */
import { stampUpdate } from '@/services/migration.service'
import { MSG } from '@/lib/mensagens-usuario'
import { getCraftPersistenceMode } from '@/lib/supabase'
import {
  atualizarContagemPendenciasAtivas,
  emitirEventoPersistencia,
} from '@/services/persistence-status.events'
import { localCraftRepository } from '@/services/repository/local.repository'
import { hybridCraftRepository } from '@/services/repository/hybrid.repository'
import { obterClientPaymentId } from '@/services/pagamentos/payment-dedupe.helpers'
import { persistirLancamentoGeralPagoNoSupabase } from '@/services/financeiro/persistir-lancamento-geral.service'
import {
  limparLancamentosRecentes,
  marcarPularPersistenciaRemotaProxima,
} from '@/services/supabase-sync/persistencia-opcoes'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import type { CraftDatabase } from '@/types/database'

export interface ResultadoMarcarLancamentoPago {
  ok: boolean
  mensagem: string
  database?: CraftDatabase
}

function gravarLocalSemPushRemoto(officeId: string, db: CraftDatabase): void {
  marcarPularPersistenciaRemotaProxima()
  localCraftRepository.salvar(officeId, db)
}

function limparIndicadoresSyncAposSucesso(officeId: string, lancamentoId: string): void {
  limparLancamentosRecentes([lancamentoId])
  hybridCraftRepository.cancelarPersistenciaRemotaAgendada(officeId)
  syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', lancamentoId)
  atualizarContagemPendenciasAtivas(officeId)
  emitirEventoPersistencia({
    type: 'pagamento_ok',
    mensagem: MSG.pagamentoRegistrado,
  })
  emitirEventoPersistencia({ type: 'supabase_ok' })
}

export async function marcarLancamentoComoPagoPersistindo(
  officeId: string,
  lancamentoId: string
): Promise<ResultadoMarcarLancamentoPago> {
  const dbAntes = localCraftRepository.carregar(officeId)
  const atual = dbAntes.lancamentos.find((l) => l.id === lancamentoId)
  if (!atual) {
    console.error('[Financeiro][marcar-pago:erro]', {
      message: 'Lançamento não encontrado no localStorage',
      lancamento_id: lancamentoId,
      office_id: officeId,
    })
    return { ok: false, mensagem: MSG.erroSalvar }
  }

  const estadoAnteriorPago = atual.pago

  // Objeto pago montado ANTES de qualquer persistência (sem depender de setState).
  const lancamentoPago = stampUpdate({
    ...atual,
    pago: true,
    sync_pendente: true,
    client_payment_id: obterClientPaymentId(atual),
  })

  const dbPago: CraftDatabase = {
    ...dbAntes,
    lancamentos: dbAntes.lancamentos.map((l) =>
      l.id === lancamentoId ? lancamentoPago : l
    ),
  }

  console.info('[Financeiro][marcar-pago:start]', {
    lancamento: lancamentoPago,
    id: lancamentoPago.id,
    local_id: lancamentoPago.id,
    client_payment_id: obterClientPaymentId(lancamentoPago),
    payment_supabase_id: lancamentoPago.payment_supabase_id,
    tipo: lancamentoPago.tipo,
    valor: lancamentoPago.valor,
    pago_antes: estadoAnteriorPago,
    pago_depois: true,
    office_id: officeId,
    sync_pendente: true,
  })

  gravarLocalSemPushRemoto(officeId, dbPago)

  if (getCraftPersistenceMode() !== 'supabase') {
    const dbLocalOk: CraftDatabase = {
      ...dbPago,
      lancamentos: dbPago.lancamentos.map((l) =>
        l.id === lancamentoId ? { ...l, sync_pendente: false } : l
      ),
    }
    gravarLocalSemPushRemoto(officeId, dbLocalOk)
    limparIndicadoresSyncAposSucesso(officeId, lancamentoId)
    return {
      ok: true,
      mensagem: MSG.pagamentoRegistrado,
      database: dbLocalOk,
    }
  }

  const remoto = await persistirLancamentoGeralPagoNoSupabase(officeId, lancamentoPago)

  if (remoto.ok && remoto.financial_id) {
    const baseOk = localCraftRepository.carregar(officeId)
    const dbOk: CraftDatabase = {
      ...baseOk,
      lancamentos: baseOk.lancamentos.map((l) =>
        l.id === lancamentoId
          ? {
              ...l,
              pago: true,
              sync_pendente: false,
              payment_supabase_id: remoto.financial_id,
              client_payment_id: obterClientPaymentId(l),
              sync_orfao: false,
              sync_orfao_motivo: undefined,
            }
          : l
      ),
    }
    gravarLocalSemPushRemoto(officeId, dbOk)
    limparIndicadoresSyncAposSucesso(officeId, lancamentoId)

    console.info('[Financeiro][marcar-pago:ok]', {
      lancamento_id: lancamentoId,
      financial_id: remoto.financial_id,
      operacao: remoto.operacao,
    })

    return {
      ok: true,
      mensagem: remoto.mensagem || MSG.pagamentoRegistrado,
      database: dbOk,
    }
  }

  console.error('[Financeiro][marcar-pago:erro]', {
    lancamento_id: lancamentoId,
    erro: remoto.erro,
    code: remoto.erro?.code,
    message: remoto.erro?.message,
    details: remoto.erro?.details,
    hint: remoto.erro?.hint,
    status: remoto.erro?.status,
    payload_lancamento: {
      id: lancamentoPago.id,
      client_payment_id: obterClientPaymentId(lancamentoPago),
      payment_supabase_id: lancamentoPago.payment_supabase_id,
      tipo: lancamentoPago.tipo,
      valor: lancamentoPago.valor,
      pago: lancamentoPago.pago,
    },
  })

  const dbAtual = localCraftRepository.carregar(officeId)
  const dbRollback: CraftDatabase = {
    ...dbAtual,
    lancamentos: dbAtual.lancamentos.map((l) =>
      l.id === lancamentoId
        ? stampUpdate({
            ...l,
            pago: estadoAnteriorPago,
            sync_pendente: true,
          })
        : l
    ),
  }
  gravarLocalSemPushRemoto(officeId, dbRollback)
  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: 'update',
    entidade: 'lancamento',
    entidade_id: lancamentoId,
  })
  atualizarContagemPendenciasAtivas(officeId)
  emitirEventoPersistencia({
    type: 'pagamentos_pendentes',
    mensagem: MSG.atencaoSync,
    pendentes: syncQueueService
      .listar(officeId, 'pendente')
      .filter((i) => i.entidade === 'lancamento').length,
  })

  return {
    ok: false,
    mensagem: 'Não foi possível marcar como pago. Tente novamente.',
    database: dbRollback,
  }
}
