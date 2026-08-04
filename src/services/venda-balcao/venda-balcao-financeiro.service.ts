/**
 * RC2 Venda Balcão A3 — receita financeira (idempotente).
 * Não cria SOP. Não mexe em pagamento de OS.
 */
import { getDataLocalHoje } from '@/lib/data-local'
import type { LancamentoFinanceiro, LancamentoFinanceiroInput } from '@/types/financeiro'
import type { VendaBalcao, VendaBalcaoFormaPagamento } from '@/types/venda-balcao'
import {
  chavePagamentoVendaBalcao,
  formaBalcaoParaFinanceiro,
} from '@/services/venda-balcao/venda-balcao-forma.helpers'

export function encontrarLancamentoVendaBalcao(
  lancamentos: LancamentoFinanceiro[],
  saleId: string
): LancamentoFinanceiro | undefined {
  const chave = chavePagamentoVendaBalcao(saleId)
  return lancamentos.find(
    (l) =>
      !l.cancelado &&
      (l.client_payment_id === chave ||
        l.id === chave ||
        (typeof l.observacao === 'string' && l.observacao.includes(`counter_sale_id:${saleId}`)))
  )
}

export function criarInputReceitaVendaBalcao(params: {
  venda: VendaBalcao
  forma: VendaBalcaoFormaPagamento | string
  usuario?: { id?: string; nome?: string }
  observacao?: string
}): LancamentoFinanceiroInput | null {
  const formaFin = formaBalcaoParaFinanceiro(params.forma)
  if (!formaFin) return null

  const total = Number(params.venda.total) || 0
  if (!(total > 0)) return null

  const num =
    params.venda.sale_number != null ? `#${params.venda.sale_number}` : params.venda.id.slice(0, 8)
  const chave = chavePagamentoVendaBalcao(params.venda.id)
  const obsExtra = params.observacao?.trim()
  const observacao = [
    `counter_sale_id:${params.venda.id}`,
    `origem:counter_sale`,
    obsExtra || null,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    tipo: 'receita',
    descricao: `Venda balcão ${num}`,
    valor: Math.round(total * 100) / 100,
    forma_pagamento: formaFin,
    data: getDataLocalHoje(),
    pago: true,
    observacao,
    usuario_id: params.usuario?.id,
    usuario_nome: params.usuario?.nome,
    cancelado: false,
    client_payment_id: chave,
    sync_pendente: true,
  }
}

export function garantirReceitaVendaBalcao(params: {
  venda: VendaBalcao
  forma: VendaBalcaoFormaPagamento | string
  lancamentos: LancamentoFinanceiro[]
  adicionarLancamento: (input: LancamentoFinanceiroInput) => LancamentoFinanceiro
  usuario?: { id?: string; nome?: string }
  observacao?: string
}): {
  status: 'criado' | 'ja_existia' | 'ignorado'
  lancamento?: LancamentoFinanceiro
} {
  const existente = encontrarLancamentoVendaBalcao(params.lancamentos, params.venda.id)
  if (existente) {
    return { status: 'ja_existia', lancamento: existente }
  }

  const input = criarInputReceitaVendaBalcao({
    venda: params.venda,
    forma: params.forma,
    usuario: params.usuario,
    observacao: params.observacao,
  })
  if (!input) return { status: 'ignorado' }

  const lancamento = params.adicionarLancamento(input)
  return { status: 'criado', lancamento }
}
