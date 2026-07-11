import { dataLocalParaIso, localIdParaUuid } from '@/lib/local-id-uuid'
import { getDataLocalHoje } from '@/lib/data-local'
import {
  sanitizarDataSupabase,
  sanitizarNumeroSupabase,
  sanitizarTextoObrigatorioSupabase,
  sanitizarTextoOpcionalSupabase,
} from '@/lib/supabase-sanitize'
import { parcelasCreditoValidas } from '@/lib/pagamento-format'
import {
  aplicarFlagsDeMetaPagamento,
  metaIndicaPagamentoInativo,
} from '@/services/pagamentos/payment-active.helpers'
import { SyncIdMap } from '@/services/supabase-sync/mappers'
import { resolverLocalId } from '@/services/supabase-sync/payment-id-resolver'
import { registrarMapeamentoId } from '@/services/supabase-sync/id-registry'
import type { FormaPagamento } from '@/types/enums'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'

export interface PaymentCraftMeta {
  local_id: string
  client_payment_id?: string
  descricao?: string
  forma_pagamento_original?: FormaPagamento
  parcelas?: number
  observacao?: string | null
  usuario_id?: string | null
  usuario_nome?: string | null
  autorizado_pin?: boolean | null
  cancelado?: boolean
  pago?: boolean
  vencimento?: string | null
  category?: string
  status?: string
  sync_status?: string
  sync_arquivado?: boolean
  sync_arquivado_em?: string
  deleted_at?: string
  payment_supabase_id?: string | null
}

export interface ServiceOrderPaymentRow {
  id: string
  office_id: string
  service_order_id: string
  customer_id: string | null
  motorcycle_id: string | null
  amount: number
  payment_method: string
  installments: number | null
  installment_amount: number | null
  payment_date: string
  notes: string | null
  created_by: string | null
  financial_transaction_id: string | null
  craft_meta: PaymentCraftMeta | Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface FinancialTransactionRow {
  id: string
  office_id: string
  type: string
  description: string
  amount: number
  payment_method: string
  transaction_date: string
  paid: boolean
  due_date: string | null
  service_order_id: string | null
  customer_id: string | null
  craft_meta: PaymentCraftMeta | Record<string, unknown>
  created_at: string
  updated_at: string
}

export function mapearFormaPagamentoParaSupabase(
  forma: FormaPagamento,
  parcelas?: number
): string {
  if (forma === 'credito') {
    const n = parcelasCreditoValidas(parcelas)
    return n > 1 ? 'credito_parcelado' : 'credito'
  }
  if (forma === 'transferencia' || forma === 'outro') return 'pix'
  return forma
}

export function mapearFormaPagamentoDoSupabase(
  method: string,
  meta?: PaymentCraftMeta
): FormaPagamento {
  if (meta?.forma_pagamento_original) return meta.forma_pagamento_original
  if (method === 'credito_parcelado') return 'credito'
  if (
    method === 'pix' ||
    method === 'dinheiro' ||
    method === 'debito' ||
    method === 'credito' ||
    method === 'fiado'
  ) {
    return method
  }
  return 'pix'
}

function calcularValorParcela(valor: number, parcelas?: number): number | undefined {
  const n = parcelasCreditoValidas(parcelas)
  if (n <= 1) return undefined
  return Math.round((valor / n) * 100) / 100
}

function buildCraftMeta(lancamento: LancamentoFinanceiro): PaymentCraftMeta {
  const clientPaymentId = lancamento.client_payment_id ?? lancamento.id
  return {
    local_id: lancamento.id,
    client_payment_id: clientPaymentId,
    descricao: lancamento.descricao,
    forma_pagamento_original: lancamento.forma_pagamento,
    parcelas: lancamento.parcelas,
    observacao: lancamento.observacao ?? null,
    usuario_id: lancamento.usuario_id ?? null,
    usuario_nome: lancamento.usuario_nome ?? null,
    autorizado_pin: lancamento.autorizado_pin ?? false,
    cancelado: lancamento.cancelado ?? false,
    pago: lancamento.pago,
    vencimento: lancamento.vencimento ?? null,
    category: lancamento.ordem_servico_id ? 'Ordem de Serviço' : undefined,
    status: lancamento.cancelado ? 'cancelado' : lancamento.pago ? 'pago' : 'pendente',
  }
}

export async function mapearFinancialTransaction(
  lancamento: LancamentoFinanceiro,
  officeUuid: string,
  ids: SyncIdMap,
  os?: OrdemServico | null,
  serviceOrderPaymentUuid?: string | null,
  idsSupabase?: {
    service_order_id?: string
    customer_id?: string | null
  }
): Promise<Record<string, unknown>> {
  const id = await ids.uuid(`fin:${lancamento.id}`)
  const clientPaymentId = lancamento.client_payment_id ?? lancamento.id
  const serviceOrderUuid = idsSupabase?.service_order_id
    ? idsSupabase.service_order_id
    : lancamento.ordem_servico_id
      ? await ids.uuid(lancamento.ordem_servico_id)
      : null
  const customerUuid =
    idsSupabase?.customer_id !== undefined
      ? idsSupabase.customer_id
      : os?.cliente_id
        ? await ids.uuid(os.cliente_id)
        : null

  return {
    id,
    office_id: officeUuid,
    type: lancamento.tipo,
    description: sanitizarTextoObrigatorioSupabase(lancamento.descricao, 'Lançamento'),
    amount: sanitizarNumeroSupabase(lancamento.valor, 0),
    payment_method: mapearFormaPagamentoParaSupabase(
      lancamento.forma_pagamento,
      lancamento.parcelas
    ),
    transaction_date:
      sanitizarDataSupabase(lancamento.data) ?? getDataLocalHoje(),
    paid: lancamento.cancelado ? false : lancamento.pago,
    due_date: lancamento.vencimento ? sanitizarDataSupabase(lancamento.vencimento) : null,
    service_order_id: serviceOrderUuid,
    customer_id: customerUuid,
    client_payment_id: clientPaymentId,
    service_order_payment_id: serviceOrderPaymentUuid ?? null,
    craft_meta: buildCraftMeta(lancamento),
    created_at: dataLocalParaIso(lancamento.created_at ?? lancamento.criado_em),
    updated_at: dataLocalParaIso(lancamento.updated_at ?? lancamento.atualizado_em),
  }
}

export async function mapearServiceOrderPayment(
  lancamento: LancamentoFinanceiro,
  officeUuid: string,
  ids: SyncIdMap,
  os: OrdemServico,
  financialTransactionUuid: string | null,
  createdBy?: string | null,
  idsSupabase?: {
    service_order_id: string
    customer_id: string | null
    motorcycle_id: string | null
  }
): Promise<Record<string, unknown>> {
  const id = await ids.uuid(`pay:${lancamento.id}`)
  const clientPaymentId = lancamento.client_payment_id ?? lancamento.id
  const parcelas = parcelasCreditoValidas(lancamento.parcelas)
  const installmentAmount = calcularValorParcela(lancamento.valor, parcelas)

  const serviceOrderId = idsSupabase?.service_order_id ?? (await ids.uuid(os.id))
  const customerId = idsSupabase
    ? idsSupabase.customer_id
    : os.cliente_id
      ? await ids.uuid(os.cliente_id)
      : null
  const motorcycleId = idsSupabase
    ? idsSupabase.motorcycle_id
    : os.moto_id
      ? await ids.uuid(os.moto_id)
      : null

  return {
    id,
    office_id: officeUuid,
    service_order_id: serviceOrderId,
    customer_id: customerId,
    motorcycle_id: motorcycleId,
    amount: sanitizarNumeroSupabase(lancamento.valor, 0),
    payment_method: mapearFormaPagamentoParaSupabase(
      lancamento.forma_pagamento,
      lancamento.parcelas
    ),
    installments: parcelas > 1 ? parcelas : null,
    installment_amount: installmentAmount ?? null,
    payment_date:
      sanitizarDataSupabase(lancamento.data) ?? getDataLocalHoje(),
    notes: sanitizarTextoOpcionalSupabase(lancamento.observacao),
    client_payment_id: clientPaymentId,
    created_by: createdBy ?? null,
    financial_transaction_id: financialTransactionUuid,
    craft_meta: {
      ...buildCraftMeta(lancamento),
      payment_supabase_id: id,
    },
    created_at: dataLocalParaIso(lancamento.created_at ?? lancamento.criado_em),
    updated_at: dataLocalParaIso(lancamento.updated_at ?? lancamento.atualizado_em),
  }
}

export function lancamentoFromServiceOrderPaymentRow(
  row: ServiceOrderPaymentRow,
  officeLocalId: string,
  localId: string,
  osLocalId: string
): LancamentoFinanceiro | null {
  const meta = (row.craft_meta ?? {}) as PaymentCraftMeta
  if (metaIndicaPagamentoInativo(meta)) return null

  const forma = mapearFormaPagamentoDoSupabase(row.payment_method, meta)

  return {
    id: localId,
    oficina_id: officeLocalId,
    office_id: officeLocalId,
    tipo: 'receita',
    descricao: meta.descricao ?? `Pagamento OS — ${forma}`,
    valor: Number(row.amount),
    forma_pagamento: forma,
    data: row.payment_date,
    pago: meta.cancelado ? false : (meta.pago ?? true),
    parcelas: meta.parcelas ?? row.installments ?? undefined,
    vencimento: meta.vencimento ?? undefined,
    ordem_servico_id: osLocalId,
    observacao: row.notes ?? meta.observacao ?? undefined,
    usuario_id: meta.usuario_id ?? undefined,
    usuario_nome: meta.usuario_nome ?? undefined,
    autorizado_pin: meta.autorizado_pin ?? undefined,
    cancelado: meta.cancelado ?? false,
    payment_supabase_id: row.id,
    sync_pendente: false,
    created_at: row.created_at,
    updated_at: row.updated_at,
    criado_em: row.created_at.slice(0, 10),
    atualizado_em: row.updated_at.slice(0, 10),
  }
}

export async function mapearServiceOrderPaymentReverso(
  row: ServiceOrderPaymentRow,
  officeLocalId: string,
  mapaOsUuidParaLocal: Map<string, string>,
  candidatos: string[]
): Promise<LancamentoFinanceiro | null> {
  const meta = (row.craft_meta ?? {}) as PaymentCraftMeta
  const clientPaymentId = meta.client_payment_id ?? meta.local_id
  const localId =
    clientPaymentId?.trim() ||
    (await resolverLocalId(
      row.id,
      meta.local_id ? [meta.local_id, ...candidatos] : candidatos,
      'pay'
    ))

  if (clientPaymentId) {
    registrarMapeamentoId(localId, row.id)
  }

  const osLocalId = mapaOsUuidParaLocal.get(row.service_order_id)
  if (!osLocalId) return null

  if (metaIndicaPagamentoInativo(meta)) return null

  const forma = mapearFormaPagamentoDoSupabase(row.payment_method, meta)

  return {
    id: localId,
    oficina_id: officeLocalId,
    office_id: officeLocalId,
    tipo: 'receita',
    descricao: meta.descricao ?? `Pagamento OS`,
    valor: Number(row.amount),
    forma_pagamento: forma,
    data: row.payment_date,
    pago: meta.cancelado ? false : (meta.pago ?? row.amount > 0),
    parcelas: meta.parcelas ?? row.installments ?? undefined,
    vencimento: meta.vencimento ?? undefined,
    ordem_servico_id: osLocalId,
    observacao: row.notes ?? meta.observacao ?? undefined,
    usuario_id: meta.usuario_id ?? undefined,
    usuario_nome: meta.usuario_nome ?? undefined,
    autorizado_pin: meta.autorizado_pin ?? undefined,
    cancelado: meta.cancelado ?? false,
    client_payment_id: meta.client_payment_id ?? meta.local_id ?? localId,
    payment_supabase_id: row.id,
    sync_pendente: false,
    ...aplicarFlagsDeMetaPagamento(meta),
    created_at: row.created_at,
    updated_at: row.updated_at,
    criado_em: row.created_at.slice(0, 10),
    atualizado_em: row.updated_at.slice(0, 10),
  }
}

export async function mapearFinancialTransactionReverso(
  row: FinancialTransactionRow,
  officeLocalId: string,
  mapaOsUuidParaLocal: Map<string, string>,
  candidatos: string[]
): Promise<LancamentoFinanceiro | null> {
  const meta = (row.craft_meta ?? {}) as PaymentCraftMeta
  if (metaIndicaPagamentoInativo(meta)) return null

  const localId = await resolverLocalId(
    row.id,
    meta.local_id ? [meta.local_id, ...candidatos] : candidatos,
    'fin'
  )

  const osLocalId = row.service_order_id
    ? mapaOsUuidParaLocal.get(row.service_order_id)
    : undefined

  const forma = mapearFormaPagamentoDoSupabase(row.payment_method, meta)

  return {
    id: localId,
    oficina_id: officeLocalId,
    office_id: officeLocalId,
    tipo: row.type === 'despesa' ? 'despesa' : 'receita',
    descricao: row.description,
    valor: Number(row.amount),
    forma_pagamento: forma,
    data: row.transaction_date,
    pago: meta.cancelado ? false : row.paid,
    parcelas: meta.parcelas,
    vencimento: row.due_date ?? meta.vencimento ?? undefined,
    ordem_servico_id: osLocalId,
    observacao: meta.observacao ?? undefined,
    usuario_id: meta.usuario_id ?? undefined,
    usuario_nome: meta.usuario_nome ?? undefined,
    autorizado_pin: meta.autorizado_pin ?? undefined,
    cancelado: meta.cancelado ?? false,
    sync_pendente: false,
    ...aplicarFlagsDeMetaPagamento(meta),
    created_at: row.created_at,
    updated_at: row.updated_at,
    criado_em: row.created_at.slice(0, 10),
    atualizado_em: row.updated_at.slice(0, 10),
  }
}

export function ehPagamentoOS(lancamento: LancamentoFinanceiro): boolean {
  return lancamento.tipo === 'receita' && !!lancamento.ordem_servico_id
}

export async function obterUuidLancamento(lancamentoId: string, prefixo: 'fin' | 'pay'): Promise<string> {
  return localIdParaUuid(`${prefixo}:${lancamentoId}`)
}
