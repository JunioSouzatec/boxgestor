/**
 * RC2 Venda Balcão A1 — mappers Supabase ↔ app.
 */
import type {
  AdicionarItemVendaBalcaoInput,
  AtualizarVendaBalcaoInput,
  CriarVendaBalcaoInput,
  VendaBalcao,
  VendaBalcaoFormaPagamento,
  VendaBalcaoItem,
  VendaBalcaoPagamentoStatus,
  VendaBalcaoStatus,
  VendaBalcaoStatusFiscal,
} from '@/types/venda-balcao'

export interface CounterSaleRow {
  id: string
  office_id: string
  local_id?: string | null
  sale_number?: number | null
  customer_id?: string | null
  local_customer_id?: string | null
  customer_name?: string | null
  customer_document?: string | null
  status: string
  payment_status: string
  payment_method?: string | null
  subtotal?: number | string | null
  discount_total?: number | string | null
  total?: number | string | null
  paid_amount?: number | string | null
  pending_amount?: number | string | null
  notes?: string | null
  seller_user_id?: string | null
  seller_name?: string | null
  sold_at?: string | null
  canceled_at?: string | null
  canceled_by?: string | null
  canceled_by_name?: string | null
  cancel_reason?: string | null
  fiscal_status?: string | null
  fiscal_metadata?: Record<string, unknown> | null
  craft_meta?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface CounterSaleItemRow {
  id: string
  office_id: string
  sale_id: string
  local_id?: string | null
  inventory_item_id?: string | null
  inventory_local_id?: string | null
  item_name: string
  sku?: string | null
  quantity: number | string
  unit?: string | null
  unit_price: number | string
  discount?: number | string | null
  total: number | string
  cost_price_snapshot?: number | string | null
  sale_price_snapshot?: number | string | null
  stock_before?: number | string | null
  stock_after?: number | string | null
  fiscal_metadata?: Record<string, unknown> | null
  craft_meta?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

function num(valor: number | string | null | undefined, fallback = 0): number {
  if (valor == null || valor === '') return fallback
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? n : fallback
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100
}

const STATUS: VendaBalcaoStatus[] = ['draft', 'paid', 'pending', 'canceled']
const PAY_STATUS: VendaBalcaoPagamentoStatus[] = ['paid', 'pending', 'canceled']
const FORMAS: VendaBalcaoFormaPagamento[] = [
  'dinheiro',
  'pix',
  'cartao_credito',
  'cartao_debito',
  'transferencia',
  'outro',
  'pendente',
]
const FISCAL: VendaBalcaoStatusFiscal[] = [
  'nao_emitida',
  'emitida',
  'autorizada',
  'cancelada',
  'rejeitada',
]

function asStatus(raw: string | null | undefined): VendaBalcaoStatus {
  return STATUS.includes(raw as VendaBalcaoStatus) ? (raw as VendaBalcaoStatus) : 'draft'
}

function asPayStatus(raw: string | null | undefined): VendaBalcaoPagamentoStatus {
  return PAY_STATUS.includes(raw as VendaBalcaoPagamentoStatus)
    ? (raw as VendaBalcaoPagamentoStatus)
    : 'pending'
}

function asForma(raw: string | null | undefined): VendaBalcaoFormaPagamento | undefined {
  if (!raw) return undefined
  return FORMAS.includes(raw as VendaBalcaoFormaPagamento)
    ? (raw as VendaBalcaoFormaPagamento)
    : undefined
}

function asFiscal(raw: string | null | undefined): VendaBalcaoStatusFiscal {
  return FISCAL.includes(raw as VendaBalcaoStatusFiscal)
    ? (raw as VendaBalcaoStatusFiscal)
    : 'nao_emitida'
}

export function mapearCounterSaleRow(
  row: CounterSaleRow,
  officeIdLocal: string,
  itens?: VendaBalcaoItem[]
): VendaBalcao {
  return {
    id: row.id,
    office_id: officeIdLocal,
    local_id: row.local_id ?? undefined,
    sale_number: row.sale_number ?? undefined,
    customer_id: row.customer_id ?? undefined,
    local_customer_id: row.local_customer_id ?? undefined,
    customer_name: row.customer_name ?? undefined,
    customer_document: row.customer_document ?? undefined,
    status: asStatus(row.status),
    payment_status: asPayStatus(row.payment_status),
    payment_method: asForma(row.payment_method),
    subtotal: arredondar2(num(row.subtotal)),
    discount_total: arredondar2(num(row.discount_total)),
    total: arredondar2(num(row.total)),
    paid_amount: arredondar2(num(row.paid_amount)),
    pending_amount: arredondar2(num(row.pending_amount)),
    notes: row.notes ?? undefined,
    seller_user_id: row.seller_user_id ?? undefined,
    seller_name: row.seller_name ?? undefined,
    sold_at: row.sold_at ?? undefined,
    canceled_at: row.canceled_at ?? undefined,
    canceled_by: row.canceled_by ?? undefined,
    canceled_by_name: row.canceled_by_name ?? undefined,
    cancel_reason: row.cancel_reason ?? undefined,
    fiscal_status: asFiscal(row.fiscal_status),
    fiscal_metadata: row.fiscal_metadata ?? {},
    craft_meta: row.craft_meta ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? undefined,
    itens,
  }
}

export function mapearCounterSaleItemRow(
  row: CounterSaleItemRow,
  officeIdLocal: string
): VendaBalcaoItem {
  return {
    id: row.id,
    office_id: officeIdLocal,
    sale_id: row.sale_id,
    local_id: row.local_id ?? undefined,
    inventory_item_id: row.inventory_item_id ?? undefined,
    inventory_local_id: row.inventory_local_id ?? undefined,
    item_name: row.item_name,
    sku: row.sku ?? undefined,
    quantity: num(row.quantity),
    unit: row.unit ?? undefined,
    unit_price: arredondar2(num(row.unit_price)),
    discount: arredondar2(num(row.discount)),
    total: arredondar2(num(row.total)),
    cost_price_snapshot:
      row.cost_price_snapshot == null ? undefined : arredondar2(num(row.cost_price_snapshot)),
    sale_price_snapshot:
      row.sale_price_snapshot == null ? undefined : arredondar2(num(row.sale_price_snapshot)),
    stock_before: row.stock_before == null ? undefined : num(row.stock_before),
    stock_after: row.stock_after == null ? undefined : num(row.stock_after),
    fiscal_metadata: row.fiscal_metadata ?? {},
    craft_meta: row.craft_meta ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? undefined,
  }
}

export function vendaBalcaoParaInsertRow(
  officeUuid: string,
  input: CriarVendaBalcaoInput
): Record<string, unknown> {
  return {
    office_id: officeUuid,
    local_id: input.local_id ?? null,
    sale_number: input.sale_number ?? null,
    customer_id: input.customer_id ?? null,
    local_customer_id: input.local_customer_id ?? null,
    customer_name: input.customer_name ?? null,
    customer_document: input.customer_document ?? null,
    status: input.status ?? 'draft',
    payment_status: input.payment_status ?? 'pending',
    payment_method: input.payment_method ?? null,
    subtotal: arredondar2(input.subtotal ?? 0),
    discount_total: arredondar2(input.discount_total ?? 0),
    total: arredondar2(input.total ?? 0),
    paid_amount: arredondar2(input.paid_amount ?? 0),
    pending_amount: arredondar2(input.pending_amount ?? 0),
    notes: input.notes ?? null,
    seller_user_id: input.seller_user_id ?? null,
    seller_name: input.seller_name ?? null,
    sold_at: input.sold_at ?? null,
    fiscal_status: input.fiscal_status ?? 'nao_emitida',
    fiscal_metadata: input.fiscal_metadata ?? {},
    craft_meta: input.craft_meta ?? {},
  }
}

export function vendaBalcaoParaUpdateRow(
  input: AtualizarVendaBalcaoInput
): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if ('customer_id' in input) row.customer_id = input.customer_id
  if ('local_customer_id' in input) row.local_customer_id = input.local_customer_id
  if ('customer_name' in input) row.customer_name = input.customer_name
  if ('customer_document' in input) row.customer_document = input.customer_document
  if (input.status != null) row.status = input.status
  if (input.payment_status != null) row.payment_status = input.payment_status
  if ('payment_method' in input) row.payment_method = input.payment_method
  if (input.subtotal != null) row.subtotal = arredondar2(input.subtotal)
  if (input.discount_total != null) row.discount_total = arredondar2(input.discount_total)
  if (input.total != null) row.total = arredondar2(input.total)
  if (input.paid_amount != null) row.paid_amount = arredondar2(input.paid_amount)
  if (input.pending_amount != null) row.pending_amount = arredondar2(input.pending_amount)
  if ('notes' in input) row.notes = input.notes
  if ('seller_user_id' in input) row.seller_user_id = input.seller_user_id
  if ('seller_name' in input) row.seller_name = input.seller_name
  if ('sold_at' in input) row.sold_at = input.sold_at
  if ('canceled_at' in input) row.canceled_at = input.canceled_at
  if ('canceled_by' in input) row.canceled_by = input.canceled_by
  if ('canceled_by_name' in input) row.canceled_by_name = input.canceled_by_name
  if ('cancel_reason' in input) row.cancel_reason = input.cancel_reason
  if (input.fiscal_status != null) row.fiscal_status = input.fiscal_status
  if (input.fiscal_metadata != null) row.fiscal_metadata = input.fiscal_metadata
  if (input.craft_meta != null) row.craft_meta = input.craft_meta
  if ('deleted_at' in input) row.deleted_at = input.deleted_at
  return row
}

export function itemVendaBalcaoParaInsertRow(
  officeUuid: string,
  saleId: string,
  input: AdicionarItemVendaBalcaoInput
): Record<string, unknown> {
  const quantity = Math.max(0.001, num(input.quantity))
  const unitPrice = arredondar2(Math.max(0, num(input.unit_price)))
  const discount = arredondar2(Math.max(0, num(input.discount)))
  const total =
    input.total != null
      ? arredondar2(Math.max(0, num(input.total)))
      : arredondar2(Math.max(0, quantity * unitPrice - discount))

  return {
    office_id: officeUuid,
    sale_id: saleId,
    local_id: input.local_id ?? null,
    inventory_item_id: input.inventory_item_id ?? null,
    inventory_local_id: input.inventory_local_id ?? null,
    item_name: input.item_name.trim(),
    sku: input.sku ?? null,
    quantity,
    unit: input.unit ?? null,
    unit_price: unitPrice,
    discount,
    total,
    cost_price_snapshot: input.cost_price_snapshot ?? null,
    sale_price_snapshot: input.sale_price_snapshot ?? null,
    stock_before: input.stock_before ?? null,
    stock_after: input.stock_after ?? null,
    fiscal_metadata: input.fiscal_metadata ?? {},
    craft_meta: input.craft_meta ?? {},
  }
}
