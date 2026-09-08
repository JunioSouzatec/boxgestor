import { analisarChaveIdempotenciaDeltaOS } from '@/lib/id-deterministico'
import type { MovimentacaoEstoque } from '@/types/movimentacao-estoque'

const TOLERANCIA_QUANTIDADE = 0.0001

function mesmoOffice(a: MovimentacaoEstoque, b: MovimentacaoEstoque): boolean {
  const officeA = a.office_id || a.oficina_id
  const officeB = b.office_id || b.oficina_id
  return Boolean(officeA && officeB && officeA === officeB)
}

function mesmaOrdemServico(a: MovimentacaoEstoque, b: MovimentacaoEstoque): boolean {
  const mesmoId = Boolean(
    a.ordem_servico_id &&
      b.ordem_servico_id &&
      a.ordem_servico_id === b.ordem_servico_id
  )
  const mesmoNumero =
    a.ordem_servico_numero != null &&
    b.ordem_servico_numero != null &&
    Number(a.ordem_servico_numero) === Number(b.ordem_servico_numero)
  return mesmoId || mesmoNumero
}

function mesmaOperacaoBase(a: MovimentacaoEstoque, b: MovimentacaoEstoque): boolean {
  return (
    mesmoOffice(a, b) &&
    mesmaOrdemServico(a, b) &&
    a.peca_id === b.peca_id &&
    a.tipo === b.tipo &&
    Math.abs((a.quantidade ?? 0) - (b.quantidade ?? 0)) < TOLERANCIA_QUANTIDADE
  )
}

function descricaoLogica(movimento: MovimentacaoEstoque): string {
  return [movimento.motivo, movimento.observacao]
    .filter(Boolean)
    .join('|')
    .trim()
    .toLocaleLowerCase('pt-BR')
}

/**
 * Compara a operação de estoque, não o instante da gravação.
 * Chaves de delta válidas prevalecem e são normalizadas antes da comparação.
 */
export function movimentacoesEstoqueEquivalentes(
  a: MovimentacaoEstoque,
  b: MovimentacaoEstoque
): boolean {
  if (!mesmaOperacaoBase(a, b)) return false

  const chaveA = analisarChaveIdempotenciaDeltaOS(a.chave_idempotencia)
  const chaveB = analisarChaveIdempotenciaDeltaOS(b.chave_idempotencia)

  if (chaveA && chaveB) return chaveA.canonica === chaveB.canonica
  if (a.chave_idempotencia || b.chave_idempotencia) {
    return a.chave_idempotencia === b.chave_idempotencia
  }

  const descricaoA = descricaoLogica(a)
  const descricaoB = descricaoLogica(b)
  return Boolean(descricaoA && descricaoB && descricaoA === descricaoB)
}

/**
 * Remoto é a fonte da verdade. Duplicatas locais/remotas da mesma operação
 * são descartadas mesmo quando usam representações textuais diferentes da chave.
 */
export function mesclarMovimentacoesEstoque(
  local: MovimentacaoEstoque[],
  remoto: MovimentacaoEstoque[]
): MovimentacaoEstoque[] {
  const resultado: MovimentacaoEstoque[] = []

  for (const movimento of [...remoto, ...local]) {
    const duplicada = resultado.some(
      (existente) =>
        existente.id === movimento.id ||
        movimentacoesEstoqueEquivalentes(existente, movimento)
    )
    if (!duplicada) resultado.push(movimento)
  }

  return resultado.sort((a, b) => b.data.localeCompare(a.data))
}
