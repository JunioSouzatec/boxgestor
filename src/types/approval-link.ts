/**
 * Tipos — Aprovação de Orçamento A2.5 (link público + parcial).
 */

export type ApprovalLinkStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'revoked'

export type ApprovalActionPublic = 'approve' | 'reject' | 'partial'

export interface ApprovalLinkRow {
  id: string
  office_id: string
  /** Nunca exposto ao cliente; só staff pode listar metadados sem hash. */
  service_order_id: string
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
  office: {
    nome: string
    logo_url?: string | null
    /** Telefone público da oficina (opcional; só se a Edge enviar). */
    telefone?: string | null
  }
  quote: {
    number: number
    customer_name: string
    vehicle_label: string
    plate?: string | null
    services: Array<{
      item_key: string
      name: string
      labor_value: number
    }>
    parts: Array<{
      item_key: string
      name: string
      quantity: number
      unit_price: number
      subtotal: number
    }>
    discount: number
    total: number
    notes?: string | null
    valid_until?: string | null
    /** Se a Edge informar conversão (A1+). Sem IDs internos. */
    converted?: boolean
    converted_os_number?: number | null
  }
  /** Alias opcional de conversão (payload enriquecido futuro). */
  conversion?: {
    converted?: boolean
    os_number?: number | null
  }
  link: {
    status: ApprovalLinkStatus
    expires_at: string
  }
  notice: string
}

export interface ItemDecisionPublicInput {
  item_key: string
  decision: 'approved' | 'rejected'
}

export interface CriarApprovalLinkResultado {
  ok: boolean
  erro?: string
  url?: string
  link_id?: string
  expires_at?: string
  notice?: string
}
