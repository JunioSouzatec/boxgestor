/**
 * F4B — Rascunho fiscal persistido (sem emissão).
 */
import type {
  ItemProdutoPreparacao,
  ItemServicoPreparacao,
  PendenciaFiscalItem,
  PreparacaoNotaFiscal,
  StatusPreparacaoFiscal,
  TipoDocumentoFiscalSugerido,
} from '@/types/fiscal-preparacao'

export type FiscalDraftOriginType = 'counter_sale' | 'service_order'

export type FiscalDraftStatus = 'draft' | 'with_issues' | 'ready_to_prepare'

export interface FiscalDraft {
  id: string
  office_id: string
  local_id?: string
  origin_type: FiscalDraftOriginType
  origin_id: string
  origin_label?: string
  document_type_suggested?: string
  status: FiscalDraftStatus
  customer_id?: string | null
  customer_snapshot: Record<string, unknown>
  issuer_snapshot: Record<string, unknown>
  items_snapshot: ItemProdutoPreparacao[]
  services_snapshot: ItemServicoPreparacao[]
  payment_snapshot: Record<string, unknown>
  issues_snapshot: PendenciaFiscalItem[]
  totals_snapshot: Record<string, unknown>
  notes?: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export function mapearStatusPreparacaoParaDraft(
  status: StatusPreparacaoFiscal
): FiscalDraftStatus {
  switch (status) {
    case 'pronta_para_preparar':
      return 'ready_to_prepare'
    case 'com_pendencias':
      return 'with_issues'
    default:
      return 'draft'
  }
}

export function labelStatusFiscalDraft(status: FiscalDraftStatus): string {
  switch (status) {
    case 'ready_to_prepare':
      return 'Pronta para preparar'
    case 'with_issues':
      return 'Com pendências'
    default:
      return 'Rascunho'
  }
}

export function origemPreparacaoParaDraft(
  origem: PreparacaoNotaFiscal['origem']
): FiscalDraftOriginType {
  return origem === 'venda_balcao' ? 'counter_sale' : 'service_order'
}

export function montarPayloadFiscalDraftDePreparacao(
  prep: PreparacaoNotaFiscal,
  opts?: { notes?: string; issuerSnapshot?: Record<string, unknown> }
): Omit<
  FiscalDraft,
  'id' | 'office_id' | 'created_at' | 'updated_at' | 'deleted_at'
> {
  const bloqueantes = prep.pendencias.filter((p) => p.severidade === 'bloqueante').length
  return {
    local_id: undefined,
    origin_type: origemPreparacaoParaDraft(prep.origem),
    origin_id: prep.origem_id,
    origin_label: prep.origem_label,
    document_type_suggested: prep.tipo_sugerido,
    status: mapearStatusPreparacaoParaDraft(prep.status),
    customer_id: prep.cliente_id ?? null,
    customer_snapshot: {
      nome: prep.cliente_nome ?? null,
      consumidor_nao_identificado: prep.consumidor_nao_identificado,
      cliente_ok: prep.cliente_ok,
    },
    issuer_snapshot: opts?.issuerSnapshot ?? {},
    items_snapshot: prep.produtos,
    services_snapshot: prep.servicos,
    payment_snapshot: {
      status_financeiro_label: prep.status_financeiro_label,
      pagamento_pendente: prep.pagamento_pendente,
      forma_pagamento: prep.forma_pagamento ?? null,
      desconto: prep.desconto ?? 0,
      valor_total: prep.valor_total,
      data: prep.data ?? null,
    },
    issues_snapshot: prep.pendencias,
    totals_snapshot: {
      valor_total: prep.valor_total,
      desconto: prep.desconto ?? 0,
      qtd_produtos: prep.produtos.length,
      qtd_servicos: prep.servicos.length,
      qtd_pendencias_bloqueantes: bloqueantes,
      qtd_pendencias: prep.pendencias.length,
      tipo_sugerido_label: prep.tipo_sugerido_label,
      status_label: prep.status_label,
    },
    notes: opts?.notes ?? null,
    metadata: {
      fase: 'F4B',
      emite_nota: false,
      gera_xml: false,
      gera_danfe: false,
      tipo_sugerido: prep.tipo_sugerido as TipoDocumentoFiscalSugerido,
      avisos: prep.avisos,
      oficina_ok: prep.oficina_ok,
      produtos_ok: prep.produtos_ok,
      servicos_ok: prep.servicos_ok,
    },
  }
}
