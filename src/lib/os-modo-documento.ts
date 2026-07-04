import { getDataLocalHoje } from '@/lib/data-local'
import type { OrdemServico, OrdemServicoInput } from '@/types/ordem-servico'

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

/** Marca o orçamento original como convertido (permanece modo_documento = orcamento). */
export function patchOrcamentoMarcarConvertido(): Pick<OrdemServico, 'status_orcamento'> {
  return { status_orcamento: 'convertido' }
}

/** Monta input de nova OS a partir de orçamento aprovado — sem pagamento automático. */
export function buildNovaOSInputFromOrcamento(os: OrdemServico): OrdemServicoInput {
  const obsOrcamento = os.observacoes_orcamento?.trim()
  const obsGarantia = os.observacoes_garantia?.trim()
  const observacoesGarantia = obsOrcamento
    ? [obsGarantia, `[Orçamento #${os.numero}] ${obsOrcamento}`].filter(Boolean).join('\n')
    : obsGarantia

  return {
    cliente_id: os.cliente_id,
    moto_id: os.moto_id,
    defeito_relatado: os.defeito_relatado,
    diagnostico: os.diagnostico,
    servicos_executados: os.servicos_executados,
    servicos_itens: os.servicos_itens ? [...os.servicos_itens] : [],
    pecas_utilizadas: os.pecas_utilizadas ? [...os.pecas_utilizadas] : [],
    valor_pecas: os.valor_pecas,
    valor_mao_obra: os.valor_mao_obra,
    valor_adicional: os.valor_adicional,
    desconto: os.desconto,
    status: 'recebida',
    checklist_entrada: os.checklist_entrada,
    valor_estimado: os.valor_estimado,
    quilometragem_entrada: os.quilometragem_entrada,
    quilometragem_saida: os.quilometragem_saida,
    dias_garantia: os.dias_garantia,
    data_vencimento_garantia: os.data_vencimento_garantia,
    observacoes_garantia: observacoesGarantia || os.observacoes_garantia,
    data_entrada: os.data_entrada ?? getDataLocalHoje(),
    data_previsao: os.data_previsao,
    data_saida: undefined,
    responsavel: os.responsavel,
    fotos: os.fotos,
    status_financeiro: undefined,
    vencimento_pagamento: undefined,
    observacoes_pagamento: undefined,
    ajuste_mao_obra: os.ajuste_mao_obra,
    estoque_baixado: false,
    modo_documento: 'os',
  }
}

/** OS/orçamentos que entram em métricas operacionais (abertas, em serviço etc.). */
export function osContaComoOperacional(os: Pick<OrdemServico, 'modo_documento' | 'status'>): boolean {
  if (ehDocumentoOrcamento(os)) return false
  return os.status !== 'cancelada'
}
