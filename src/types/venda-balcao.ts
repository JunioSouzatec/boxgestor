/**
 * RC2 Venda Balcão Fase A1 — tipos da base técnica.
 * Sem emissão fiscal, sem baixa de estoque, sem caixa/financeiro nesta fase.
 * UI: Pago / Pendente / A receber / Cancelado — nunca "fiado".
 */

export type VendaBalcaoStatus = 'draft' | 'paid' | 'pending' | 'canceled'

export type VendaBalcaoPagamentoStatus = 'paid' | 'pending' | 'canceled'

/** Formas compatíveis com o sistema; "pendente" = a receber (não usar fiado). */
export type VendaBalcaoFormaPagamento =
  | 'dinheiro'
  | 'pix'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'transferencia'
  | 'outro'
  | 'pendente'

export type VendaBalcaoStatusFiscal =
  | 'nao_emitida'
  | 'emitida'
  | 'autorizada'
  | 'cancelada'
  | 'rejeitada'

export interface VendaBalcaoItem {
  id: string
  office_id: string
  sale_id: string
  local_id?: string
  inventory_item_id?: string
  inventory_local_id?: string
  item_name: string
  sku?: string
  quantity: number
  unit?: string
  unit_price: number
  discount: number
  total: number
  cost_price_snapshot?: number
  sale_price_snapshot?: number
  /** Preenchidos na Fase A2 (baixa real). */
  stock_before?: number
  stock_after?: number
  fiscal_metadata: Record<string, unknown>
  craft_meta: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface VendaBalcao {
  id: string
  office_id: string
  local_id?: string
  sale_number?: number
  customer_id?: string
  local_customer_id?: string
  customer_name?: string
  customer_document?: string
  status: VendaBalcaoStatus
  payment_status: VendaBalcaoPagamentoStatus
  payment_method?: VendaBalcaoFormaPagamento
  subtotal: number
  discount_total: number
  total: number
  paid_amount: number
  pending_amount: number
  notes?: string
  seller_user_id?: string
  seller_name?: string
  sold_at?: string
  canceled_at?: string
  canceled_by?: string
  canceled_by_name?: string
  cancel_reason?: string
  fiscal_status: VendaBalcaoStatusFiscal
  fiscal_metadata: Record<string, unknown>
  craft_meta: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at?: string
  itens?: VendaBalcaoItem[]
}

export interface CriarVendaBalcaoInput {
  local_id?: string
  sale_number?: number
  customer_id?: string
  local_customer_id?: string
  customer_name?: string
  customer_document?: string
  status?: VendaBalcaoStatus
  payment_status?: VendaBalcaoPagamentoStatus
  payment_method?: VendaBalcaoFormaPagamento
  subtotal?: number
  discount_total?: number
  total?: number
  paid_amount?: number
  pending_amount?: number
  notes?: string
  seller_user_id?: string
  seller_name?: string
  sold_at?: string
  fiscal_status?: VendaBalcaoStatusFiscal
  fiscal_metadata?: Record<string, unknown>
  craft_meta?: Record<string, unknown>
}

export interface AtualizarVendaBalcaoInput {
  customer_id?: string | null
  local_customer_id?: string | null
  customer_name?: string | null
  customer_document?: string | null
  status?: VendaBalcaoStatus
  payment_status?: VendaBalcaoPagamentoStatus
  payment_method?: VendaBalcaoFormaPagamento | null
  subtotal?: number
  discount_total?: number
  total?: number
  paid_amount?: number
  pending_amount?: number
  notes?: string | null
  seller_user_id?: string | null
  seller_name?: string | null
  sold_at?: string | null
  canceled_at?: string | null
  canceled_by?: string | null
  canceled_by_name?: string | null
  cancel_reason?: string | null
  fiscal_status?: VendaBalcaoStatusFiscal
  fiscal_metadata?: Record<string, unknown>
  craft_meta?: Record<string, unknown>
  deleted_at?: string | null
}

export interface AdicionarItemVendaBalcaoInput {
  local_id?: string
  inventory_item_id?: string
  inventory_local_id?: string
  item_name: string
  sku?: string
  quantity: number
  unit?: string
  unit_price: number
  discount?: number
  total?: number
  cost_price_snapshot?: number
  sale_price_snapshot?: number
  stock_before?: number
  stock_after?: number
  fiscal_metadata?: Record<string, unknown>
  craft_meta?: Record<string, unknown>
}

export interface TotaisVendaBalcao {
  subtotal: number
  discount_total: number
  total: number
  paid_amount: number
  pending_amount: number
}

export const LABEL_STATUS_VENDA_BALCAO: Record<VendaBalcaoStatus, string> = {
  draft: 'Rascunho',
  paid: 'Pago',
  pending: 'Pendente',
  canceled: 'Cancelado',
}

export const LABEL_PAGAMENTO_VENDA_BALCAO: Record<VendaBalcaoPagamentoStatus, string> = {
  paid: 'Pago',
  pending: 'A receber',
  canceled: 'Cancelado',
}

export const LABEL_FORMA_PAGAMENTO_VENDA_BALCAO: Record<VendaBalcaoFormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
  outro: 'Outro',
  pendente: 'Pendente',
}

export function labelStatusVendaBalcao(status: VendaBalcaoStatus | string): string {
  return LABEL_STATUS_VENDA_BALCAO[status as VendaBalcaoStatus] ?? status
}

export function labelPagamentoVendaBalcao(
  status: VendaBalcaoPagamentoStatus | string
): string {
  return LABEL_PAGAMENTO_VENDA_BALCAO[status as VendaBalcaoPagamentoStatus] ?? status
}
