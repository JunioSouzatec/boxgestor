import type { TenantEntity, Timestamped } from '@/types/base'
import type { FormaPagamento, TipoLancamento } from '@/types/enums'

export interface LancamentoFinanceiro extends TenantEntity, Timestamped {
  tipo: TipoLancamento
  descricao: string
  valor: number
  forma_pagamento: FormaPagamento
  data: string
  pago: boolean
  parcelas?: number
  vencimento?: string
  ordem_servico_id?: string
  observacao?: string
  usuario_id?: string
  usuario_nome?: string
  cancelado?: boolean
  created_at?: string
  updated_at?: string
  /** UUID do pagamento no Supabase (service_order_payments) */
  payment_supabase_id?: string
  /** Aguardando sincronização com Supabase */
  sync_pendente?: boolean
}

export type LancamentoFinanceiroInput = Omit<
  LancamentoFinanceiro,
  'id' | 'oficina_id' | 'office_id' | 'created_at' | 'updated_at'
>
