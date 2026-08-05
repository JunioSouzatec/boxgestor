/**
 * RC2 Venda Balcão A3 — registrar sale no caixa (separado da OS).
 * Não chama registrarVendaNoCaixaSeAplicavel (exige service_order_payment_id).
 */
import { localIdParaUuid } from '@/lib/local-id-uuid'
import {
  criarMovimentoCaixa,
  obterCaixaAberto,
} from '@/services/caixa/caixa.service'
import { buscarSaleAtivoPorPagamentoRemoto } from '@/services/caixa/supabase-caixa.persistence'
import type { MovimentoCaixa } from '@/types/caixa'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { VendaBalcao } from '@/types/venda-balcao'
import { chavePagamentoVendaBalcao } from '@/services/venda-balcao/venda-balcao-forma.helpers'
import { formatarFormaPagamentoHistorico } from '@/lib/pagamento-format'
import type { ResultadoVendaCaixa } from '@/services/caixa/registrar-venda-caixa.service'

/**
 * Cria movimento tipo sale no caixa aberto, se houver.
 * Idempotente via local_lancamento_id = counter-sale-payment:{saleId}.
 */
export async function registrarVendaBalcaoNoCaixaSeAplicavel(params: {
  officeId: string
  venda: VendaBalcao
  lancamento: LancamentoFinanceiro
  createdBy?: string | null
  createdByName?: string | null
}): Promise<ResultadoVendaCaixa> {
  const { officeId, venda, lancamento } = params
  const valor = Number(lancamento.valor)
  const clientPaymentId =
    lancamento.client_payment_id?.trim() || chavePagamentoVendaBalcao(venda.id)

  if (!lancamento.pago) return { status: 'ignorado' }
  if (lancamento.forma_pagamento === 'fiado') return { status: 'ignorado' }
  if (!(valor > 0)) return { status: 'ignorado' }

  try {
    const existente = await buscarSaleAtivoPorPagamentoRemoto(officeId, {
      clientPaymentId,
      localLancamentoId: clientPaymentId,
    })
    if (existente.ok && existente.dados) {
      return { status: 'ja_existia', movimento: existente.dados }
    }

    const aberto = await obterCaixaAberto(officeId)
    if (!aberto.ok || !aberto.dados || aberto.dados.status !== 'open') {
      return { status: 'sem_caixa' }
    }

    let financialTransactionId: string | null = null
    try {
      financialTransactionId = await localIdParaUuid(`fin:${lancamento.id}`)
    } catch {
      financialTransactionId = null
    }

    const num =
      venda.sale_number != null ? `#${venda.sale_number}` : venda.id.slice(0, 8)

    const formaLabel =
      (typeof venda.craft_meta?.payment_method_label === 'string' &&
        venda.craft_meta.payment_method_label) ||
      formatarFormaPagamentoHistorico(lancamento)

    const criado = await criarMovimentoCaixa({
      officeId,
      cashSessionId: aberto.dados.id,
      type: 'sale',
      amount: valor,
      paymentMethod: lancamento.forma_pagamento,
      reason: 'Venda balcão',
      notes: `Venda balcão ${num} · ${formaLabel}`,
      createdBy: params.createdBy,
      createdByName: params.createdByName,
      serviceOrderPaymentId: null,
      financialTransactionId,
      localLancamentoId: clientPaymentId,
      craftMeta: {
        origem: 'counter_sale',
        counter_sale_id: venda.id,
        local_id: venda.local_id ?? null,
        client_payment_id: clientPaymentId,
        local_lancamento_id: lancamento.id,
        payment_method: lancamento.forma_pagamento,
        payment_method_label: formaLabel,
        installments: lancamento.parcelas ?? null,
        chave_caixa: `counter-sale-cash:${venda.id}`,
      },
    })

    if (criado.ok && criado.dados) {
      return { status: 'registrado', movimento: criado.dados as MovimentoCaixa }
    }

    const deNovo = await buscarSaleAtivoPorPagamentoRemoto(officeId, {
      clientPaymentId,
      localLancamentoId: clientPaymentId,
    })
    if (deNovo.ok && deNovo.dados) {
      return { status: 'ja_existia', movimento: deNovo.dados }
    }

    return { status: 'erro', erro: criado.erro ?? 'Falha ao registrar no caixa.' }
  } catch (err) {
    return {
      status: 'erro',
      erro: err instanceof Error ? err.message : String(err),
    }
  }
}
