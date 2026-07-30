/** RC2 Comissão Fase B1 — itens por OS e baixas parciais (conta corrente). */

export type StatusComissaoItem =
  | 'em_aberto'
  | 'parcial'
  | 'pago'
  | 'cancelado'
  | 'ajustado'

export type StatusComissaoSettlement = 'ativo' | 'corrigido' | 'cancelado'

export interface ComissaoItem {
  id: string
  office_id: string
  /** id local do perfil de comissão */
  employee_id: string
  employee_name: string
  service_order_id: string
  service_order_number?: string
  customer_name?: string
  vehicle_label?: string
  competence_month: string
  reference_date?: string
  base_labor: number
  base_parts: number
  commission_type?: string
  labor_percent: number
  parts_percent: number
  commission_amount: number
  paid_amount: number
  open_amount: number
  status: StatusComissaoItem
  source_snapshot?: Record<string, unknown>
  adjustment_of_item_id?: string
  adjustment_reason?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface ComissaoSettlement {
  id: string
  office_id: string
  employee_id: string
  employee_name: string
  competence_month?: string
  amount_paid: number
  payment_method?: string
  paid_at: string
  paid_by?: string
  paid_by_name?: string
  notes?: string
  status: StatusComissaoSettlement
  correction_of_id?: string
  correction_reason?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface ComissaoSettlementItem {
  id: string
  office_id: string
  settlement_id: string
  commission_item_id: string
  amount_paid: number
  created_at: string
}

export interface SaldoComissaoFuncionario {
  employee_id: string
  employee_name: string
  competence_month?: string
  total_gerado: number
  total_pago: number
  saldo_em_aberto: number
  qtd_itens_abertos: number
  qtd_itens_pagos: number
  qtd_itens_parciais: number
}

export interface CriarBaixaComissaoParcialInput {
  employee_id: string
  employee_name: string
  amount_paid: number
  payment_method?: string
  competence_month?: string
  notes?: string
  /** Se informado, paga só estes itens (ordem preservada). Senão FIFO por data. */
  item_ids?: string[]
}

export interface ResultadoBaixaComissaoParcial {
  ok: boolean
  settlement?: ComissaoSettlement
  alocacoes?: Array<{ commission_item_id: string; amount_paid: number; status_apos: StatusComissaoItem }>
  excedente?: number
  erro?: string
}

export interface DiagnosticoBackfillComissaoItem {
  employee_id: string
  employee_name: string
  competence_month: string
  itens_simulados: number
  total_itens_simulados: number
  baixa_antiga_commission_amount: number | null
  diferenca: number | null
  os_ids: string[]
}
