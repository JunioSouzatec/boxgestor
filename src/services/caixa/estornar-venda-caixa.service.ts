/**
 * Caixa Fase 2D — cancelar/estornar sale ao excluir pagamento OS.
 *
 * Regras:
 * - Sem sale → no-op
 * - Sale em caixa aberto → soft delete do sale (sem refund)
 * - Sale em caixa fechado → refund no caixa aberto atual (não altera sessão fechada)
 * - Sem caixa aberto para estorno → aviso suave, não bloqueia exclusão
 * - Nunca bloqueia o cancelamento do pagamento
 *
 * Pendência: cancelar OS (patchCancelamentoPagamentosOS) ainda não passa pelo
 * pipeline de arquivamento — alinhar em fase futura se seguro.
 */

import { isUuidFormato, localIdParaUuid } from '@/lib/local-id-uuid'
import { obterClientPaymentId } from '@/services/pagamentos/payment-dedupe.helpers'
import {
  cancelarMovimentoCaixa,
  criarMovimentoCaixa,
  obterCaixaAberto,
  registrarAuditoriaCaixa,
} from '@/services/caixa/caixa.service'
import {
  buscarRefundAtivoPorPagamentoRemoto,
  buscarSaleAtivoPorPagamentoRemoto,
  obterSessaoCaixaRemoto,
} from '@/services/caixa/supabase-caixa.persistence'
import type { MovimentoCaixa } from '@/types/caixa'
import type { LancamentoFinanceiro } from '@/types/financeiro'

export type StatusEstornoCaixa =
  | 'sale_cancelado'
  | 'sale_ja_cancelado'
  | 'refund_criado'
  | 'refund_ja_existia'
  | 'sem_sale'
  | 'sem_caixa_para_estorno'
  | 'ignorado'
  | 'erro'

export interface ResultadoEstornoCaixa {
  status: StatusEstornoCaixa
  movimento?: MovimentoCaixa
  erro?: string
}

export interface EstornarVendaCaixaParams {
  officeId: string
  lancamento: LancamentoFinanceiro
  serviceOrderPaymentId?: string | null
  financialTransactionId?: string | null
  createdBy?: string | null
  createdByName?: string | null
  osLabel?: string | null
  /** Motivo do soft-delete do sale (default: pagamento OS). */
  reasonCancelamento?: string | null
  /** Texto do refund (default: estorno pagamento OS). */
  reasonRefund?: string | null
  notesRefund?: string | null
  /** Extra em craft_meta do refund (não sobrescreve chaves internas). */
  craftMetaExtra?: Record<string, unknown>
}

function ehUniqueRefundViolation(erro?: string): boolean {
  const m = (erro ?? '').toLowerCase()
  return (
    m.includes('cash_movements_unique_active_refund_payment') ||
    m.includes('duplicate key') ||
    m.includes('unique constraint')
  )
}

/**
 * Cancela ou estorna o sale vinculado ao pagamento OS, se existir.
 * Nunca deve falhar o fluxo de exclusão do pagamento.
 */
export async function estornarVendaCaixaSeAplicavel(
  params: EstornarVendaCaixaParams
): Promise<ResultadoEstornoCaixa> {
  const { officeId, lancamento } = params
  const clientPaymentId = obterClientPaymentId(lancamento)
  const serviceOrderPaymentId =
    params.serviceOrderPaymentId?.trim() ||
    lancamento.payment_supabase_id?.trim() ||
    ''
  const valor = Number(lancamento.valor)

  // Pagamento pendente (enum interno fiado) / sem valor: tipicamente sem sale
  if (lancamento.forma_pagamento === 'fiado') return { status: 'ignorado' }
  if (!Number.isFinite(valor) || valor <= 0) return { status: 'sem_sale' }

  const registrarEstornoPendenteSemCaixa = async (ctx: {
    sale: MovimentoCaixa
    saleSessionId: string
  }): Promise<ResultadoEstornoCaixa> => {
    const sopId =
      (serviceOrderPaymentId && isUuidFormato(serviceOrderPaymentId)
        ? serviceOrderPaymentId
        : ctx.sale.service_order_payment_id) || null

    await registrarAuditoriaCaixa({
      officeId,
      // Sessão original da venda (fechada) — rastreio; não altera o caixa fechado
      cashSessionId: ctx.saleSessionId,
      action: 'refund_pending_no_open_cash',
      actorId: params.createdBy,
      actorName: params.createdByName,
      payload: {
        service_order_payment_id: sopId,
        local_lancamento_id: lancamento.id,
        client_payment_id: clientPaymentId,
        financial_transaction_id: ctx.sale.financial_transaction_id,
        amount: valor > 0 ? valor : ctx.sale.amount,
        payment_method: lancamento.forma_pagamento || ctx.sale.payment_method,
        ordem_servico_id: lancamento.ordem_servico_id ?? null,
        os_label: params.osLabel?.trim() || null,
        sale_movement_id: ctx.sale.id,
        sale_session_id: ctx.sale.cash_session_id,
        reason: 'Pagamento cancelado sem caixa aberto para estorno',
      },
    })

    return { status: 'sem_caixa_para_estorno' }
  }

  try {
    const saleBusca = await buscarSaleAtivoPorPagamentoRemoto(officeId, {
      serviceOrderPaymentId: serviceOrderPaymentId || null,
      clientPaymentId,
      localLancamentoId: lancamento.id,
    })

    if (!saleBusca.ok) {
      console.warn('[BoxGestor Caixa] Lookup sale para estorno falhou', saleBusca.erro)
      return { status: 'erro', erro: saleBusca.erro }
    }

    const sale = saleBusca.dados
    if (!sale) return { status: 'sem_sale' }

    const sessao = await obterSessaoCaixaRemoto(officeId, sale.cash_session_id)
    if (!sessao.ok || !sessao.dados) {
      console.warn('[BoxGestor Caixa] Sessão do sale não encontrada', sessao.erro)
      return { status: 'erro', erro: sessao.erro ?? 'Sessão do sale não encontrada' }
    }

    // Caso A — caixa da venda ainda aberto: soft delete do sale
    if (sessao.dados.status === 'open') {
      const cancelado = await cancelarMovimentoCaixa({
        officeId,
        movementId: sale.id,
        cancelledBy: params.createdBy,
        cancelledByName: params.createdByName,
        reason: params.reasonCancelamento?.trim() || 'Pagamento de OS cancelado',
      })

      if (cancelado.ok && cancelado.dados) {
        return { status: 'sale_cancelado', movimento: cancelado.dados }
      }

      const msg = (cancelado.erro ?? '').toLowerCase()
      if (msg.includes('não encontrado') || msg.includes('nao encontrado')) {
        return { status: 'sale_ja_cancelado' }
      }

      console.warn('[BoxGestor Caixa] Soft delete sale falhou', cancelado.erro)
      return { status: 'erro', erro: cancelado.erro }
    }

    // Caso B — caixa da venda fechado: refund no caixa aberto atual
    if (sessao.dados.status === 'closed') {
      const sopId =
        (serviceOrderPaymentId && isUuidFormato(serviceOrderPaymentId)
          ? serviceOrderPaymentId
          : sale.service_order_payment_id) || null

      const refundExistente = await buscarRefundAtivoPorPagamentoRemoto(officeId, {
        serviceOrderPaymentId: sopId,
        clientPaymentId,
        localLancamentoId: lancamento.id,
      })
      if (refundExistente.ok && refundExistente.dados) {
        return { status: 'refund_ja_existia', movimento: refundExistente.dados }
      }

      const aberto = await obterCaixaAberto(officeId)
      if (!aberto.ok) {
        console.warn('[BoxGestor Caixa] obterCaixaAberto para refund falhou', aberto.erro)
        return registrarEstornoPendenteSemCaixa({
          sale,
          saleSessionId: sale.cash_session_id,
        })
      }
      if (!aberto.dados || aberto.dados.status !== 'open') {
        return registrarEstornoPendenteSemCaixa({
          sale,
          saleSessionId: sale.cash_session_id,
        })
      }

      let financialTransactionId =
        params.financialTransactionId?.trim() &&
        isUuidFormato(params.financialTransactionId)
          ? params.financialTransactionId.trim()
          : sale.financial_transaction_id
      if (!financialTransactionId) {
        try {
          financialTransactionId = await localIdParaUuid(`fin:${lancamento.id}`)
        } catch {
          financialTransactionId = null
        }
      }

      const osLabel = params.osLabel?.trim()
      const notes =
        params.notesRefund?.trim() ||
        (osLabel
          ? `Estorno de pagamento de ${osLabel}`
          : 'Estorno de pagamento de OS')
      const reasonRefund =
        params.reasonRefund?.trim() || 'Estorno de pagamento de OS'

      const criado = await criarMovimentoCaixa({
        officeId,
        cashSessionId: aberto.dados.id,
        type: 'refund',
        amount: valor > 0 ? valor : sale.amount,
        paymentMethod: lancamento.forma_pagamento || sale.payment_method,
        reason: reasonRefund,
        notes,
        createdBy: params.createdBy,
        createdByName: params.createdByName,
        serviceOrderPaymentId: sopId,
        financialTransactionId,
        localLancamentoId: clientPaymentId,
        craftMeta: {
          fase: '2D',
          client_payment_id: clientPaymentId,
          local_lancamento_id: lancamento.id,
          ordem_servico_id: lancamento.ordem_servico_id ?? null,
          sale_movement_id: sale.id,
          sale_session_id: sale.cash_session_id,
          origem: 'estorno_pagamento_os',
          ...(params.craftMetaExtra ?? {}),
        },
      })

      if (criado.ok && criado.dados) {
        return { status: 'refund_criado', movimento: criado.dados }
      }

      if (ehUniqueRefundViolation(criado.erro)) {
        const deNovo = await buscarRefundAtivoPorPagamentoRemoto(officeId, {
          serviceOrderPaymentId: sopId,
          clientPaymentId,
          localLancamentoId: lancamento.id,
        })
        if (deNovo.ok && deNovo.dados) {
          return { status: 'refund_ja_existia', movimento: deNovo.dados }
        }
        return { status: 'refund_ja_existia' }
      }

      console.warn('[BoxGestor Caixa] Criar refund falhou', criado.erro)
      return { status: 'erro', erro: criado.erro }
    }

    return { status: 'ignorado' }
  } catch (err) {
    console.warn('[BoxGestor Caixa] Exceção ao estornar sale', err)
    return {
      status: 'erro',
      erro: err instanceof Error ? err.message : String(err),
    }
  }
}
