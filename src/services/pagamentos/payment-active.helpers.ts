import type { PaymentCraftMeta } from '@/services/supabase-sync/payment-mappers'
import type { LancamentoFinanceiro } from '@/types/financeiro'

const STATUS_INATIVOS = new Set([
  'cancelado',
  'deleted',
  'archived',
  'discarded',
  'arquivado',
  'descartado',
])

export function metaIndicaPagamentoInativo(meta?: PaymentCraftMeta | null): boolean {
  if (!meta) return false
  if (meta.cancelado) return true
  if (meta.sync_arquivado) return true
  const status = (meta.status ?? meta.sync_status ?? '').toLowerCase()
  return STATUS_INATIVOS.has(status)
}

export function aplicarFlagsDeMetaPagamento(
  meta?: PaymentCraftMeta | null
): Partial<LancamentoFinanceiro> {
  if (!metaIndicaPagamentoInativo(meta)) return {}
  const status = (meta?.status ?? meta?.sync_status ?? 'archived').toLowerCase()
  return {
    cancelado: true,
    pago: false,
    sync_arquivado: true,
    sync_arquivado_em: meta?.sync_arquivado_em ?? meta?.deleted_at ?? new Date().toISOString(),
    sync_orfao: status === 'discarded' ? true : undefined,
  }
}

/** Pagamento de OS visível no histórico e contabilizado no valor pago. */
export function isPagamentoOsAtivo(l: LancamentoFinanceiro): boolean {
  if (l.tipo !== 'receita' || !l.ordem_servico_id) return false
  if (l.cancelado) return false
  if (l.sync_arquivado) return false
  if (l.sync_orfao) return false
  return true
}

export function marcarPagamentoArquivado(
  l: LancamentoFinanceiro,
  motivo = 'Duplicata reparada'
): LancamentoFinanceiro {
  const agora = new Date().toISOString()
  return {
    ...l,
    cancelado: true,
    pago: false,
    sync_arquivado: true,
    sync_arquivado_em: agora,
    sync_pendente: true,
    sync_orfao_motivo: l.sync_orfao_motivo ?? motivo,
    atualizado_em: agora.slice(0, 10),
  }
}

export function marcarPagamentoExcluido(l: LancamentoFinanceiro): LancamentoFinanceiro {
  const agora = new Date().toISOString()
  return {
    ...l,
    cancelado: true,
    pago: false,
    sync_arquivado: true,
    sync_arquivado_em: agora,
    sync_pendente: true,
    atualizado_em: agora.slice(0, 10),
  }
}

export function buildCraftMetaArquivado(
  lancamento: LancamentoFinanceiro,
  status: 'archived' | 'deleted'
): PaymentCraftMeta {
  const agora = new Date().toISOString()
  return {
    local_id: lancamento.id,
    client_payment_id: lancamento.client_payment_id ?? lancamento.id,
    descricao: lancamento.descricao,
    forma_pagamento_original: lancamento.forma_pagamento,
    parcelas: lancamento.parcelas,
    observacao: lancamento.observacao ?? null,
    usuario_id: lancamento.usuario_id ?? null,
    usuario_nome: lancamento.usuario_nome ?? null,
    cancelado: true,
    pago: false,
    vencimento: lancamento.vencimento ?? null,
    category: lancamento.ordem_servico_id ? 'Ordem de Serviço' : undefined,
    status,
    sync_status: status === 'deleted' ? 'discarded' : 'archived',
    sync_arquivado: true,
    sync_arquivado_em: agora,
    deleted_at: status === 'deleted' ? agora : undefined,
    payment_supabase_id: lancamento.payment_supabase_id ?? null,
  }
}
