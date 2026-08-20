/**
 * Tipos — Aprovação de Orçamento / Portal do Cliente público.
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

export type PortalPublicMode = 'approval' | 'service_tracking'

/** A4.1 — acompanhamento sanitizado (somente service_tracking). */
export type PublicTrackingStep = {
  etapa: string
  titulo: string
  descricao?: string
  concluida: boolean
  atual: boolean
}

export type PublicServiceTracking = {
  status_publico: string
  status_codigo?: string
  etapa_atual?: string
  descricao?: string
  previsao_entrega?: string | null
  atualizado_em?: string | null
  progresso?: PublicTrackingStep[]
  avisos?: string[]
  /** OS entregue: acompanhamento público limitado. */
  encerrado?: boolean
}

export interface PublicQuoteApprovalPayload {
  office: {
    nome: string
    logo_url?: string | null
    /** Telefone público da oficina (offices.phone). */
    telefone?: string | null
    /** WhatsApp público da oficina (settings.metadata.whatsapp). */
    whatsapp?: string | null
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
    converted?: boolean
    converted_os_number?: number | null
    converted_at?: string | null
    /** Label amigável do status operacional da OS gerada. */
    generated_os_status?: string | null
    generated_os_expected_delivery_date?: string | null
  }
  conversion?: {
    converted?: boolean
    os_number?: number | null
    converted_at?: string | null
    generated_os_status?: string | null
    generated_os_expected_delivery_date?: string | null
  }
  link: {
    status: ApprovalLinkStatus
    expires_at: string
  }
  /**
   * Modo do portal público (sanitizado).
   * approval = orçamento com botões; service_tracking = acompanhamento/fotos sem aprovação.
   */
  portal_mode?: PortalPublicMode
  notice: string
  /** A4.1 — bloco sanitizado de acompanhamento (sem craft_meta/historico bruto). */
  tracking?: PublicServiceTracking
  /** Fotos opt-in (include_in_portal). Signed URL curta; sem storage_path. */
  photos?: Array<{
    id: string
    signed_url: string
    caption?: string | null
    type?: string | null
    created_at?: string | null
    sort_order?: number | null
  }>
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
