import type { TenantEntity } from '@/types/base'
import type { FormaPagamento, TipoLancamento } from '@/types/enums'

export interface LancamentoFinanceiro extends TenantEntity {
  tipo: TipoLancamento
  descricao: string
  valor: number
  forma_pagamento: FormaPagamento
  data: string
  pago: boolean
  vencimento?: string
  ordem_servico_id?: string
  created_at?: string
  updated_at?: string
}

export type LancamentoFinanceiroInput = Omit<
  LancamentoFinanceiro,
  'id' | 'oficina_id' | 'office_id' | 'created_at' | 'updated_at'
>
