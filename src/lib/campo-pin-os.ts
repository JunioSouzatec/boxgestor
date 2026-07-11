/** Identificadores únicos por campo sensível — PIN autoriza somente o fieldId correspondente. */

export function buildCampoPinPecaValorUnitario(linhaId: string): string {
  return `peca:${linhaId}:valor_unitario`
}

export function buildCampoPinPecaDialogValorUnitario(sessaoId: string): string {
  return `peca:dialog:${sessaoId}:valor_unitario`
}

export function buildCampoPinPecaSugeridaValorUnitario(
  servicoId: string,
  sugestaoId: string
): string {
  return `peca:sugestao:${servicoId}:${sugestaoId}:valor_unitario`
}

export function buildCampoPinServicoValor(servicoId: string): string {
  return `servico:${servicoId}:valor`
}

export function buildCampoPinMaoObraResumo(): string {
  return `mao_obra:valor`
}

export function buildCampoPinAdicional(): string {
  return `adicionais:valor`
}

export function buildCampoPinDesconto(): string {
  return `desconto:valor`
}

export function buildCampoPinRegistrarPagamento(osId: string, tentativaId: string): string {
  return `pagamento:os:${osId}:${tentativaId}`
}
