import type {
  AuditoriaCaixa,
  MovimentoCaixa,
  SessaoCaixa,
  StatusCaixaSessao,
  TipoMovimentoCaixa,
} from '@/types/caixa'

const TIPOS_MOVIMENTO: TipoMovimentoCaixa[] = [
  'manual_in',
  'manual_out',
  'sangria',
  'suprimento',
  'sale',
  'refund',
]

export interface CashSessionRow {
  id: string
  office_id: string
  opened_by: string | null
  opened_by_name: string | null
  closed_by: string | null
  closed_by_name: string | null
  opened_at: string
  closed_at: string | null
  opening_balance: number | string
  closing_balance_informed: number | string | null
  expected_balance: number | string
  difference: number | string | null
  status: string
  notes: string | null
  craft_meta: Record<string, unknown> | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CashAuditLogRow {
  id: string
  office_id: string
  cash_session_id: string | null
  action: string
  actor_id: string | null
  actor_name: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

export interface CashMovementRow {
  id: string
  office_id: string
  cash_session_id: string
  type: string
  amount: number | string
  payment_method: string | null
  reason: string | null
  notes: string | null
  created_by: string | null
  created_by_name: string | null
  authorized_by: string | null
  authorized_by_name: string | null
  authorized_by_pin: boolean | null
  service_order_payment_id: string | null
  financial_transaction_id: string | null
  local_lancamento_id: string | null
  craft_meta: Record<string, unknown> | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function num(valor: number | string | null | undefined, fallback = 0): number {
  if (valor == null || valor === '') return fallback
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? n : fallback
}

function statusCaixa(raw: string | null | undefined): StatusCaixaSessao {
  return raw === 'closed' ? 'closed' : 'open'
}

function tipoMovimento(raw: string | null | undefined): TipoMovimentoCaixa {
  if (raw && (TIPOS_MOVIMENTO as string[]).includes(raw)) {
    return raw as TipoMovimentoCaixa
  }
  return 'manual_in'
}

export function mapearSessaoCaixaDoSupabase(row: CashSessionRow): SessaoCaixa {
  return {
    id: row.id,
    office_id: row.office_id,
    opened_by: row.opened_by,
    opened_by_name: row.opened_by_name,
    closed_by: row.closed_by,
    closed_by_name: row.closed_by_name,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    opening_balance: num(row.opening_balance),
    closing_balance_informed:
      row.closing_balance_informed == null ? null : num(row.closing_balance_informed),
    expected_balance: num(row.expected_balance),
    difference: row.difference == null ? null : num(row.difference),
    status: statusCaixa(row.status),
    notes: row.notes,
    craft_meta:
      row.craft_meta && typeof row.craft_meta === 'object' ? row.craft_meta : {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  }
}

export function mapearAuditoriaCaixaDoSupabase(row: CashAuditLogRow): AuditoriaCaixa {
  return {
    id: row.id,
    office_id: row.office_id,
    cash_session_id: row.cash_session_id,
    action: row.action,
    actor_id: row.actor_id,
    actor_name: row.actor_name,
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
    created_at: row.created_at,
  }
}

export function mapearMovimentoCaixaDoSupabase(row: CashMovementRow): MovimentoCaixa {
  return {
    id: row.id,
    office_id: row.office_id,
    cash_session_id: row.cash_session_id,
    type: tipoMovimento(row.type),
    amount: num(row.amount),
    payment_method: row.payment_method,
    reason: row.reason,
    notes: row.notes,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    authorized_by: row.authorized_by,
    authorized_by_name: row.authorized_by_name,
    authorized_by_pin: Boolean(row.authorized_by_pin),
    service_order_payment_id: row.service_order_payment_id,
    financial_transaction_id: row.financial_transaction_id,
    local_lancamento_id: row.local_lancamento_id,
    craft_meta:
      row.craft_meta && typeof row.craft_meta === 'object' ? row.craft_meta : {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  }
}
