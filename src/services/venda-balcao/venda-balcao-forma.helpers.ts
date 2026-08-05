/**
 * Mapeia forma de pagamento da venda balcão ↔ financeiro/caixa (FormaPagamento).
 * Nunca usa "fiado" na UI — pendente fica fora do registro financeiro.
 */
import { OPCOES_PARCELAS, parcelasCreditoValidas } from '@/lib/pagamento-format'
import type { FormaPagamento } from '@/types/enums'
import type { VendaBalcao, VendaBalcaoFormaPagamento } from '@/types/venda-balcao'
import { LABEL_FORMA_PAGAMENTO_VENDA_BALCAO } from '@/types/venda-balcao'

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

/** Parcelamento só se aplica a cartão de crédito (1–12). */
export function normalizarParcelasVendaBalcao(
  forma: VendaBalcaoFormaPagamento | string | undefined,
  parcelas?: number | null
): number | undefined {
  if (forma !== 'cartao_credito') return undefined
  return parcelasCreditoValidas(parcelas ?? undefined)
}

export function labelBaseFormaVendaBalcao(
  forma: VendaBalcaoFormaPagamento | string | undefined
): string {
  if (!forma) return '—'
  return (
    LABEL_FORMA_PAGAMENTO_VENDA_BALCAO[forma as VendaBalcaoFormaPagamento] ?? String(forma)
  )
}

/** Ex.: "Cartão de crédito — 3x" / "Cartão de crédito — 1x à vista" */
export function formatarFormaBalcaoComParcelas(
  forma: VendaBalcaoFormaPagamento | string | undefined,
  parcelas?: number | null
): string {
  const base = labelBaseFormaVendaBalcao(forma)
  if (forma !== 'cartao_credito') return base
  const n = normalizarParcelasVendaBalcao(forma, parcelas) ?? 1
  return n <= 1 ? `${base} — 1x à vista` : `${base} — ${n}x`
}

export function opcoesParcelasVendaBalcao(): { value: number; label: string }[] {
  return OPCOES_PARCELAS
}

export function obterParcelasCraftMetaVenda(venda: Pick<VendaBalcao, 'craft_meta'>): number | undefined {
  const raw = venda.craft_meta?.installments
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 1) return undefined
  return Math.min(12, Math.max(1, Math.round(n)))
}

/** Campos de craft_meta para parcelamento (sem migration). */
export function montarCraftMetaParcelamento(params: {
  forma: VendaBalcaoFormaPagamento | string
  parcelas?: number | null
  metaAtual?: Record<string, unknown>
}): Record<string, unknown> {
  const parcelas = normalizarParcelasVendaBalcao(params.forma, params.parcelas)
  const base = labelBaseFormaVendaBalcao(params.forma)
  const label = formatarFormaBalcaoComParcelas(params.forma, parcelas)
  return {
    ...params.metaAtual,
    installments: parcelas ?? null,
    payment_method_base: base,
    payment_method_label: label,
  }
}
