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
export function buildNovaOSInputFromOrcamento(orcamento: OrdemServico): OrdemServicoInput {
  const obsOrcamento = orcamento.observacoes_orcamento?.trim()
  const obsGarantia = orcamento.observacoes_garantia?.trim()
  const observacoesGarantia = obsOrcamento
    ? [obsGarantia, `[Orçamento #${orcamento.numero}] ${obsOrcamento}`].filter(Boolean).join('\n')
    : obsGarantia

  return {
    cliente_id: orcamento.cliente_id,
    moto_id: orcamento.moto_id,
    defeito_relatado: orcamento.defeito_relatado,
    diagnostico: orcamento.diagnostico,
    servicos_executados: orcamento.servicos_executados,
    servicos_itens: orcamento.servicos_itens ? [...orcamento.servicos_itens] : [],
    pecas_utilizadas: orcamento.pecas_utilizadas ? [...orcamento.pecas_utilizadas] : [],
    valor_pecas: orcamento.valor_pecas,
    valor_mao_obra: orcamento.valor_mao_obra,
    valor_adicional: orcamento.valor_adicional,
    desconto: orcamento.desconto,
    status: 'em_servico',
    checklist_entrada: orcamento.checklist_entrada,
    valor_estimado: orcamento.valor_estimado,
    quilometragem_entrada: orcamento.quilometragem_entrada,
    quilometragem_saida: orcamento.quilometragem_saida,
    dias_garantia: orcamento.dias_garantia,
    data_vencimento_garantia: orcamento.data_vencimento_garantia,
    observacoes_garantia: observacoesGarantia || orcamento.observacoes_garantia,
    data_entrada: orcamento.data_entrada ?? getDataLocalHoje(),
    data_previsao: orcamento.data_previsao,
    data_saida: undefined,
    responsavel: orcamento.responsavel,
    responsavel_id: orcamento.responsavel_id,
    fotos: orcamento.fotos,
    status_financeiro: undefined,
    vencimento_pagamento: undefined,
    observacoes_pagamento: undefined,
    ajuste_mao_obra: orcamento.ajuste_mao_obra,
    estoque_baixado: false,
    modo_documento: 'os',
    orcamento_origem_id: orcamento.id,
    orcamento_origem_numero: orcamento.numero,
  }
}

/** OS/orçamentos que entram em métricas operacionais (abertas, em serviço etc.). */
export function osContaComoOperacional(os: Pick<OrdemServico, 'modo_documento' | 'status'>): boolean {
  if (ehDocumentoOrcamento(os)) return false
  return os.status !== 'cancelada'
}
