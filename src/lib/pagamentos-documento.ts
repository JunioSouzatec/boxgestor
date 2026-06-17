import { formatarData, formatarMoeda } from '@/lib/utils'
import { formatarDetalhePagamento, formatarPagamentoAVista } from '@/lib/pagamento-format'
import type { LancamentoFinanceiro } from '@/types'

export interface PagamentoRegistradoDocumento {
  data: string
  forma: string
  parcelamento: string
  valor: string
  observacao: string
}

/** Monta linhas de pagamentos para PDF de OS e recibo (mesma lógica). */
export function montarHistoricoPagamentosDocumento(
  pagamentos: LancamentoFinanceiro[]
): PagamentoRegistradoDocumento[] {
  return [...pagamentos]
    .filter((p) => p.pago)
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))
    .map((p) => {
      const detalhe = formatarDetalhePagamento(p)
      let parcelamento = detalhe.parcelamento ?? '—'

      if (p.forma_pagamento === 'credito' && !detalhe.parcelamento) {
        parcelamento = formatarPagamentoAVista()
      }

      return {
        data: formatarData(p.data),
        forma: detalhe.forma,
        parcelamento,
        valor: formatarMoeda(p.valor),
        observacao: p.observacao?.trim() || '—',
      }
    })
}
