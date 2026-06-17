import { formatarMoeda } from '@/lib/utils'
import { normalizarUnidadePeca, type UnidadePecaOS } from '@/types/unidade-peca'

export interface PecaLinhaPdfInput {
  nome: string
  quantidade?: number | null
  unidade?: UnidadePecaOS | string | null
  valor_unitario?: number | null
  codigo?: string
  observacao?: string
}

export interface PecaLinhaPdfResult {
  linha: string
  quantidade: number
  valorUnitario: number
  subtotal: number
}

export function normalizarQuantidadePecaPdf(quantidade?: number | null): number {
  if (quantidade === undefined || quantidade === null || Number.isNaN(quantidade) || quantidade <= 0) {
    return 1
  }
  return quantidade
}

export function resolverValorUnitarioPecaPdf(
  quantidade: number,
  valorUnitario?: number | null,
  subtotal?: number | null
): number {
  if (
    valorUnitario !== undefined &&
    valorUnitario !== null &&
    !Number.isNaN(valorUnitario) &&
    valorUnitario > 0
  ) {
    return valorUnitario
  }

  const qty = normalizarQuantidadePecaPdf(quantidade)
  if (subtotal !== undefined && subtotal !== null && !Number.isNaN(subtotal) && subtotal > 0 && qty > 0) {
    return subtotal / qty
  }

  return valorUnitario ?? 0
}

function formatarNumeroQuantidadePdf(quantidade: number): string {
  return Number.isInteger(quantidade)
    ? String(quantidade)
    : quantidade.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      })
}

/** Quantidade + unidade abreviada para PDF (ex.: 1 un., 4 litros). */
export function formatarQuantidadeUnidadeCurtaPdf(
  quantidade: number,
  unidade?: UnidadePecaOS | string | null
): string {
  const u = normalizarUnidadePeca(unidade)
  const qtd = formatarNumeroQuantidadePdf(quantidade)

  switch (u) {
    case 'unidade':
      return `${qtd} un.`
    case 'litro':
      return `${qtd} litro${quantidade !== 1 ? 's' : ''}`
    case 'ml':
      return `${qtd} ml`
    case 'par':
      return `${qtd} par${quantidade !== 1 ? 'es' : ''}`
    case 'jogo':
      return `${qtd} jogo${quantidade !== 1 ? 's' : ''}`
    case 'metro':
      return `${qtd} metro${quantidade !== 1 ? 's' : ''}`
    case 'pacote':
      return `${qtd} pacote${quantidade !== 1 ? 's' : ''}`
    case 'caixa':
      return `${qtd} caixa${quantidade !== 1 ? 's' : ''}`
    case 'kit':
      return `${qtd} kit${quantidade !== 1 ? 's' : ''}`
    case 'grama':
      return `${qtd} g`
    case 'kg':
      return `${qtd} kg`
    case 'outro':
      return qtd
    default:
      return `${qtd} un.`
  }
}

/**
 * Linha de peça/produto para PDF:
 * Nome — quantidade un. x R$ unitário = R$ total
 */
export function formatarLinhaPecaPdf(item: PecaLinhaPdfInput): PecaLinhaPdfResult {
  const quantidade = normalizarQuantidadePecaPdf(item.quantidade)
  const subtotalSalvo = quantidade * (item.valor_unitario ?? 0)
  const valorUnitario = resolverValorUnitarioPecaPdf(
    quantidade,
    item.valor_unitario,
    subtotalSalvo > 0 ? subtotalSalvo : null
  )
  const subtotal = quantidade * valorUnitario
  const qtdUnidade = formatarQuantidadeUnidadeCurtaPdf(quantidade, item.unidade)

  const sufixoNome = [
    item.codigo ? ` (${item.codigo})` : '',
    item.observacao ? ` — ${item.observacao}` : '',
  ].join('')

  const linha = `${item.nome}${sufixoNome} — ${qtdUnidade} x ${formatarMoeda(valorUnitario)} = ${formatarMoeda(subtotal)}`

  return { linha, quantidade, valorUnitario, subtotal }
}
