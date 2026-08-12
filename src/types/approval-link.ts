/**
 * Tipos — Aprovação de Orçamento A2.1 (link público com token hash).
 * Backend/migration ainda NÃO aplicados em produção nesta fase.
 */

export type ApprovalLinkStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'revoked'

export interface ApprovalLinkRow {
  id: string
  office_id: string
  service_order_id: string
  /** Nunca exposto ao cliente; só staff pode listar metadados sem hash. */
  status: ApprovalLinkStatus
  expires_at: string
  created_by?: string | null
  created_at: string
  updated_at: string
  sent_at?: string | null
  approved_at?: string | null
  rejected_at?: string | null
  revoked_at?: string | null
  response_name?: string | null
  response_note?: string | null
  last_accessed_at?: string | null
  metadata?: Record<string, unknown>
}

export interface PublicQuoteApprovalPayload {
  office: { nome: string; logo_url?: string | null }
  quote: {
    number: number
    customer_name: string
    vehicle_label: string
    plate?: string | null
    services: Array<{ name: string; labor_value: number }>
    parts: Array<{
      name: string
      quantity: number
      unit_price: number
      subtotal: number
    }>
    discount: number
    total: number
    notes?: string | null
    valid_until?: string | null
  }
  link: {
    status: ApprovalLinkStatus
    expires_at: string
  }
  notice: string
}

export interface CriarApprovalLinkResultado {
  ok: boolean
  erro?: string
  url?: string
  link_id?: string
  expires_at?: string
  notice?: string
}
