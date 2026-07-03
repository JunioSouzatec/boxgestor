import type { OrdemServico } from '@/types/ordem-servico'

export type ModoDocumentoOS = 'os' | 'orcamento'

export function normalizarModoDocumentoOS(
  modo: unknown,
  fallback: ModoDocumentoOS = 'os'
): ModoDocumentoOS {
  return modo === 'orcamento' ? 'orcamento' : fallback
}

export function ehDocumentoOrcamento(os: Pick<OrdemServico, 'modo_documento'>): boolean {
  return os.modo_documento === 'orcamento'
}

export function tituloDocumentoOS(os: Pick<OrdemServico, 'modo_documento' | 'numero'>): string {
  return ehDocumentoOrcamento(os) ? `Orçamento #${os.numero}` : `Ordem de Serviço #${os.numero}`
}

export function rotuloCurtoDocumentoOS(os: Pick<OrdemServico, 'modo_documento'>): string {
  return ehDocumentoOrcamento(os) ? 'Orçamento' : 'OS'
}

/** Converte orçamento em OS operacional — mantém dados, limpa flags de orçamento. */
export function converterOrcamentoEmOS(os: OrdemServico): OrdemServico {
  return {
    ...os,
    modo_documento: 'os',
    status: os.status === 'aguardando_aprovacao' ? 'recebida' : os.status,
    status_orcamento: undefined,
    data_orcamento: undefined,
    observacoes_orcamento: undefined,
  }
}

/** OS/orçamentos que entram em métricas operacionais (abertas, em serviço etc.). */
export function osContaComoOperacional(os: Pick<OrdemServico, 'modo_documento' | 'status'>): boolean {
  if (ehDocumentoOrcamento(os)) return false
  return os.status !== 'cancelada'
}
