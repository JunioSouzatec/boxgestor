import type { AuditoriaCaixa, SessaoCaixa, StatusCaixaSessao } from '@/types/caixa'

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

function num(valor: number | string | null | undefined, fallback = 0): number {
  if (valor == null || valor === '') return fallback
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? n : fallback
}

function statusCaixa(raw: string | null | undefined): StatusCaixaSessao {
  return raw === 'closed' ? 'closed' : 'open'
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
