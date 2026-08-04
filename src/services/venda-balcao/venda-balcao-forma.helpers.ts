/**
 * Mapeia forma de pagamento da venda balcão ↔ financeiro/caixa (FormaPagamento).
 * Nunca usa "fiado" na UI — pendente fica fora do registro financeiro.
 */
import type { FormaPagamento } from '@/types/enums'
import type { VendaBalcaoFormaPagamento } from '@/types/venda-balcao'

export function formaBalcaoParaFinanceiro(
  forma: VendaBalcaoFormaPagamento | string | undefined
): FormaPagamento | null {
  switch (forma) {
    case 'dinheiro':
      return 'dinheiro'
    case 'pix':
      return 'pix'
    case 'cartao_debito':
      return 'debito'
    case 'cartao_credito':
      return 'credito'
    case 'transferencia':
      return 'transferencia'
    case 'outro':
      return 'outro'
    case 'pendente':
      return null
    default:
      return null
  }
}

export function chavePagamentoVendaBalcao(saleId: string): string {
  return `counter-sale-payment:${saleId}`
}

export function chaveCaixaVendaBalcao(saleId: string): string {
  return `counter-sale-cash:${saleId}`
}
