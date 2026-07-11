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
  /** Pagamento registrado com autorização PIN do dono/admin */
  autorizado_pin?: boolean
  created_at?: string
  updated_at?: string
  /** UUID do pagamento no Supabase (service_order_payments) */
  payment_supabase_id?: string
  /** ID estável criado uma única vez no app — nunca muda na sincronização */
  client_payment_id?: string
  /** Aguardando sincronização com Supabase */
  sync_pendente?: boolean
  /** Sem OS correspondente no Supabase — não reenviar */
  sync_orfao?: boolean
  /** Motivo do órfão (auditoria) */
  sync_orfao_motivo?: string
  /** Pendência órfã arquivada/descartada localmente */
  sync_arquivado?: boolean
  /** Data do arquivamento local (ISO) */
  sync_arquivado_em?: string
}

export type LancamentoFinanceiroInput = Omit<
  LancamentoFinanceiro,
  'id' | 'oficina_id' | 'office_id' | 'created_at' | 'updated_at'
>
