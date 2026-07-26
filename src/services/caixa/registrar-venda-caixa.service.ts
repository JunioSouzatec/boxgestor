/**
 * Caixa Fase 2C — vincular pagamento OS ao caixa aberto (tipo sale).
 *
 * Não cria receita financeira nova.
 * Não bloqueia pagamento se não houver caixa.
 * Não cria caixa automático.
 * Fiado / pago:false não entram.
 *
 * Fase 2D: ver estornar-venda-caixa.service.ts (chamado no arquivamento).
 */

import { isUuidFormato, localIdParaUuid } from '@/lib/local-id-uuid'
import { obterClientPaymentId } from '@/services/pagamentos/payment-dedupe.helpers'
import {
  criarMovimentoCaixa,
  obterCaixaAberto,
} from '@/services/caixa/caixa.service'
import {
  buscarSaleAtivoPorPagamentoRemoto,
} from '@/services/caixa/supabase-caixa.persistence'
import type { MovimentoCaixa, ResultadoCaixa } from '@/types/caixa'
import type { LancamentoFinanceiro } from '@/types/financeiro'

export type StatusVendaCaixa =
  | 'registrado'
  | 'ja_existia'
  | 'sem_caixa'
  | 'ignorado'
  | 'erro'

export interface ResultadoVendaCaixa {
  status: StatusVendaCaixa
  movimento?: MovimentoCaixa
  erro?: string
}

export interface RegistrarVendaCaixaParams {
  officeId: string
  lancamento: LancamentoFinanceiro
  /** UUID em service_order_payments (= payment_supabase_id) */
  serviceOrderPaymentId: string
  financialTransactionId?: string | null
  createdBy?: string | null
  createdByName?: string | null
  /** Ex.: "OS 123" */
  osLabel?: string | null
}

function ehUniqueSaleViolation(erro?: string): boolean {
  const m = (erro ?? '').toLowerCase()
  return (
    m.includes('cash_movements_unique_active_sale_payment') ||
    m.includes('duplicate key') ||
    m.includes('unique constraint')
  )
}

/**
 * Cria sale no caixa aberto se aplicável.
 * Sempre seguro: nunca bloqueia o fluxo de pagamento da OS.
 */
export async function registrarVendaNoCaixaSeAplicavel(
  params: RegistrarVendaCaixaParams
): Promise<ResultadoVendaCaixa> {
  const { officeId, lancamento } = params
  const serviceOrderPaymentId = params.serviceOrderPaymentId?.trim()
  const clientPaymentId = obterClientPaymentId(lancamento)
  const valor = Number(lancamento.valor)

  if (!lancamento.pago) return { status: 'ignorado' }
  if (lancamento.forma_pagamento === 'fiado') return { status: 'ignorado' }
  if (!Number.isFinite(valor) || valor <= 0) return { status: 'ignorado' }
  if (!serviceOrderPaymentId || !isUuidFormato(serviceOrderPaymentId)) {
    return { status: 'ignorado' }
  }

  try {
    const existente = await buscarSaleAtivoPorPagamentoRemoto(officeId, {
      serviceOrderPaymentId,
      clientPaymentId,
      localLancamentoId: lancamento.id,
    })
    if (!existente.ok) {
      // Falha de lookup não deve quebrar pagamento
      console.warn('[BoxGestor Caixa] Lookup sale falhou', existente.erro)
    } else if (existente.dados) {
      return { status: 'ja_existia', movimento: existente.dados }
    }

    const aberto = await obterCaixaAberto(officeId)
    if (!aberto.ok) {
      console.warn('[BoxGestor Caixa] obterCaixaAberto falhou', aberto.erro)
      return { status: 'sem_caixa' }
    }
    if (!aberto.dados || aberto.dados.status !== 'open') {
      return { status: 'sem_caixa' }
    }

    let financialTransactionId =
      params.financialTransactionId?.trim() &&
      isUuidFormato(params.financialTransactionId)
        ? params.financialTransactionId.trim()
        : null
    if (!financialTransactionId) {
      try {
        financialTransactionId = await localIdParaUuid(`fin:${lancamento.id}`)
      } catch {
        financialTransactionId = null
      }
    }

    const osLabel = params.osLabel?.trim()
    const notes = osLabel
      ? `Pagamento de ${osLabel}`
      : lancamento.ordem_servico_id
        ? `Pagamento de OS ${lancamento.ordem_servico_id}`
        : 'Pagamento de OS'

    const criado: ResultadoCaixa<MovimentoCaixa> = await criarMovimentoCaixa({
      officeId,
      cashSessionId: aberto.dados.id,
      type: 'sale',
      amount: valor,
      paymentMethod: lancamento.forma_pagamento,
      reason: 'Pagamento de OS',
      notes,
      createdBy: params.createdBy,
      createdByName: params.createdByName,
      serviceOrderPaymentId,
      financialTransactionId,
      localLancamentoId: clientPaymentId,
      craftMeta: {
        fase: '2C',
        client_payment_id: clientPaymentId,
        local_lancamento_id: lancamento.id,
        ordem_servico_id: lancamento.ordem_servico_id ?? null,
        origem: 'pagamento_os',
      },
    })

    if (criado.ok && criado.dados) {
      return { status: 'registrado', movimento: criado.dados }
    }

    if (ehUniqueSaleViolation(criado.erro)) {
      const deNovo = await buscarSaleAtivoPorPagamentoRemoto(officeId, {
        serviceOrderPaymentId,
        clientPaymentId,
        localLancamentoId: lancamento.id,
      })
      if (deNovo.ok && deNovo.dados) {
        return { status: 'ja_existia', movimento: deNovo.dados }
      }
      return { status: 'ja_existia' }
    }

    console.warn('[BoxGestor Caixa] Falha ao criar sale', criado.erro)
    return { status: 'erro', erro: criado.erro }
  } catch (err) {
    console.warn('[BoxGestor Caixa] Exceção ao registrar sale', err)
    return {
      status: 'erro',
      erro: err instanceof Error ? err.message : String(err),
    }
  }
}
