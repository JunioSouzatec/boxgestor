/**
 * Caixa (sessão) — Fase 1A: abrir/fechar sem movimentos de pagamento.
 */

export type StatusCaixaSessao = 'open' | 'closed'

export type AcaoAuditoriaCaixa =
  | 'cash_session_opened'
  | 'cash_session_closed'
  | 'cash_session_notes_updated'

export interface SessaoCaixa {
  id: string
  office_id: string
  opened_by: string | null
  opened_by_name: string | null
  closed_by: string | null
  closed_by_name: string | null
  opened_at: string
  closed_at: string | null
  opening_balance: number
  closing_balance_informed: number | null
  expected_balance: number
  difference: number | null
  status: StatusCaixaSessao
  notes: string | null
  craft_meta: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface AuditoriaCaixa {
  id: string
  office_id: string
  cash_session_id: string | null
  action: string
  actor_id: string | null
  actor_name: string | null
  payload: Record<string, unknown>
  created_at: string
}

export interface AbrirCaixaParams {
  officeId: string
  openingBalance: number
  openedBy?: string | null
  openedByName?: string | null
  notes?: string | null
}

export interface FecharCaixaParams {
  officeId: string
  sessionId: string
  closingBalanceInformed: number
  closedBy?: string | null
  closedByName?: string | null
  notes?: string | null
}

export interface ListarSessoesCaixaFiltros {
  status?: StatusCaixaSessao
  /** Limite de linhas (default 50) */
  limite?: number
}

export interface ResultadoCaixa<T = unknown> {
  ok: boolean
  dados?: T
  erro?: string
}
