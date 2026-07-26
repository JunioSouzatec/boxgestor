/**
 * Caixa — sessões (1A) + movimentos (2A).
 * Fase 2A: base técnica de movimentos, sem vínculo com pagamento OS na UI/fluxo.
 */

export type StatusCaixaSessao = 'open' | 'closed'

export type TipoMovimentoCaixa =
  | 'manual_in'
  | 'manual_out'
  | 'sangria'
  | 'suprimento'
  | 'sale'
  | 'refund'

export type AcaoAuditoriaCaixa =
  | 'cash_session_opened'
  | 'cash_session_closed'
  | 'cash_session_notes_updated'
  | 'cash_movement_created'
  | 'cash_movement_cancelled'

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

export interface MovimentoCaixa {
  id: string
  office_id: string
  cash_session_id: string
  type: TipoMovimentoCaixa
  amount: number
  payment_method: string | null
  reason: string | null
  notes: string | null
  created_by: string | null
  created_by_name: string | null
  authorized_by: string | null
  authorized_by_name: string | null
  authorized_by_pin: boolean
  service_order_payment_id: string | null
  financial_transaction_id: string | null
  local_lancamento_id: string | null
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

export interface ResumoCaixa {
  cash_session_id: string
  opening_balance: number
  totalEntradas: number
  totalSaidas: number
  totalSangrias: number
  totalSuprimentos: number
  totalVendas: number
  totalEstornos: number
  /** opening + entradas + suprimentos + vendas - saídas - sangrias - estornos */
  saldoEsperado: number
  quantidadeMovimentos: number
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

export interface CriarMovimentoCaixaParams {
  officeId: string
  cashSessionId: string
  type: TipoMovimentoCaixa
  amount: number
  paymentMethod?: string | null
  reason?: string | null
  notes?: string | null
  createdBy?: string | null
  createdByName?: string | null
  authorizedBy?: string | null
  authorizedByName?: string | null
  authorizedByPin?: boolean
  /** Preparado para vínculo futuro — não usado pelo fluxo de OS nesta fase */
  serviceOrderPaymentId?: string | null
  financialTransactionId?: string | null
  localLancamentoId?: string | null
  craftMeta?: Record<string, unknown>
}

export interface CancelarMovimentoCaixaParams {
  officeId: string
  movementId: string
  cancelledBy?: string | null
  cancelledByName?: string | null
  reason?: string | null
}

export interface ResultadoCaixa<T = unknown> {
  ok: boolean
  dados?: T
  erro?: string
}
