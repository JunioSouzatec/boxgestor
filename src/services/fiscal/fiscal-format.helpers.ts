/**
 * F4A — labels amigáveis para exibição (sem alterar dados/validação).
 */
import { REGIMES_TRIBUTARIOS } from '@/types/fiscal'
import {
  LABEL_FORMA_PAGAMENTO_VENDA_BALCAO,
  type VendaBalcao,
  type VendaBalcaoFormaPagamento,
} from '@/types/venda-balcao'
import {
  formatarFormaBalcaoComParcelas,
  obterParcelasCraftMetaVenda,
} from '@/services/venda-balcao/venda-balcao-forma.helpers'

/** Alias legados → chave canônica de RegimeTributario. */
const REGIME_ALIAS: Record<string, string> = {
  simples_excesso_sublimite: 'simples_nacional_excesso',
  simples_nacional_excesso_sublimite: 'simples_nacional_excesso',
}

/**
 * mei → MEI · simples_nacional → Simples Nacional · etc.
 */
export function labelRegimeTributarioFiscal(raw?: string | null): string {
  const v = String(raw ?? '').trim()
  if (!v) return '—'
  const canonico = REGIME_ALIAS[v] ?? v
  const conhecido = REGIMES_TRIBUTARIOS.find((r) => r.value === canonico)
  if (conhecido) return conhecido.label
  // Fallback amigável: snake_case → Título
  return v
    .split('_')
    .filter(Boolean)
    .map((p) => (p.length <= 3 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ')
}

/**
 * Preferir craft_meta.payment_method_label (ex.: "Cartão de crédito — 3x");
 * senão formatar a partir de payment_method + installments.
 */
export function labelFormaPagamentoPreparacaoFiscal(input: {
  payment_method?: string | null
  craft_meta?: Record<string, unknown> | null
}): string {
  const metaLabel =
    typeof input.craft_meta?.payment_method_label === 'string'
      ? input.craft_meta.payment_method_label.trim()
      : ''
  if (metaLabel) return metaLabel

  const forma = input.payment_method?.trim()
  if (!forma) return '—'

  const parcelas =
    input.craft_meta != null
      ? obterParcelasCraftMetaVenda({ craft_meta: input.craft_meta } as Pick<VendaBalcao, 'craft_meta'>)
      : undefined

  if (forma === 'cartao_credito') {
    return formatarFormaBalcaoComParcelas(forma, parcelas)
  }

  return (
    LABEL_FORMA_PAGAMENTO_VENDA_BALCAO[forma as VendaBalcaoFormaPagamento] ??
    forma
      .split('_')
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ')
  )
}
