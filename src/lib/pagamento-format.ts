import { formatarMoeda } from '@/lib/utils'
import type { FormaPagamento } from '@/types/enums'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import { getLabelFormaPagamento } from '@/types/labels'

/** Valor legado ainda presente em dados antigos */
export type FormaPagamentoLegado = FormaPagamento | 'credito_parcelado'

export const OPCOES_PARCELAS: { value: number; label: string }[] = [
  { value: 1, label: '1x à vista' },
  ...Array.from({ length: 11 }, (_, i) => ({
    value: i + 2,
    label: `${i + 2}x`,
  })),
]

export function normalizarFormaPagamento(
  forma: FormaPagamentoLegado
): FormaPagamento {
  if (forma === 'credito_parcelado') return 'credito'
  return forma
}

export function normalizarLancamentoPagamento(
  lancamento: LancamentoFinanceiro
): LancamentoFinanceiro {
  const formaLegada = lancamento.forma_pagamento as FormaPagamentoLegado
  const forma = normalizarFormaPagamento(formaLegada)

  let parcelas = lancamento.parcelas
  if (forma === 'credito') {
    if (formaLegada === 'credito_parcelado' && !parcelas) {
      parcelas = 2
    }
    if (!parcelas || parcelas < 1) {
      parcelas = 1
    }
  } else {
    parcelas = undefined
  }

  return {
    ...lancamento,
    forma_pagamento: forma,
    parcelas,
  }
}

export function calcularValorParcela(valorTotal: number, parcelas: number): number {
  if (parcelas <= 0) return valorTotal
  return Math.round((valorTotal / parcelas) * 100) / 100
}

export function formatarParcelamento(valor: number, parcelas?: number): string | undefined {
  if (!parcelas || parcelas <= 1) return undefined
  const valorParcela = calcularValorParcela(valor, parcelas)
  return `${parcelas}x de ${formatarMoeda(valorParcela)}`
}

export function formatarPagamentoAVista(): string {
  return '1x à vista'
}

export interface DetalhePagamentoFormatado {
  forma: string
  parcelamento?: string
  pagamentoLabel: string
  total: string
  linhas: string[]
}

export function formatarDetalhePagamento(
  lancamento: Pick<LancamentoFinanceiro, 'forma_pagamento' | 'valor' | 'parcelas'>
): DetalhePagamentoFormatado {
  const normalizado = normalizarLancamentoPagamento({
    ...lancamento,
    id: '',
    tipo: 'receita',
    descricao: '',
    data: '',
    pago: true,
    oficina_id: '',
    office_id: '',
  })

  const forma = getLabelFormaPagamento(normalizado.forma_pagamento)
  const total = formatarMoeda(normalizado.valor)
  const parcelamento = formatarParcelamento(
    normalizado.valor,
    normalizado.parcelas
  )

  let pagamentoLabel: string
  if (normalizado.forma_pagamento === 'credito') {
    pagamentoLabel = parcelamento ?? formatarPagamentoAVista()
  } else {
    pagamentoLabel = forma
  }

  const linhas = [`Forma de pagamento: ${forma}`]
  if (normalizado.forma_pagamento === 'credito') {
    linhas.push(
      parcelamento
        ? `Parcelamento: ${parcelamento}`
        : `Pagamento: ${formatarPagamentoAVista()}`
    )
  }
  linhas.push(`Total: ${total}`)

  return {
    forma,
    parcelamento,
    pagamentoLabel,
    total,
    linhas,
  }
}

export function formatarFormaPagamentoHistorico(
  lancamento: Pick<LancamentoFinanceiro, 'forma_pagamento' | 'valor' | 'parcelas'>
): string {
  const detalhe = formatarDetalhePagamento(lancamento)
  if (normalizarFormaPagamento(lancamento.forma_pagamento as FormaPagamentoLegado) === 'credito') {
    return detalhe.parcelamento
      ? `${detalhe.forma} — ${detalhe.parcelamento}`
      : `${detalhe.forma} — ${formatarPagamentoAVista()}`
  }
  return detalhe.forma
}

export function parcelasCreditoValidas(parcelas?: number): number {
  if (!parcelas || parcelas < 1) return 1
  if (parcelas > 12) return 12
  return parcelas
}
