import type { TenantTimestampedEntity } from '@/types/base'
import type { ChecklistEntrada, ChecklistEntradaLegado } from '@/types/checklist'
import type { StatusFinanceiroOS, StatusOrcamento, StatusOS } from '@/types/enums'

export interface PecaUtilizada {
  peca_id: string
  nome: string
  quantidade: number
  valor_unitario: number
}

export interface FotoOS {
  url: string
  tipo: 'antes' | 'depois'
  descricao?: string
}

export interface OrdemServico extends TenantTimestampedEntity {
  cliente_id: string
  moto_id: string
  numero: number
  defeito_relatado: string
  diagnostico: string
  servicos_executados: string
  pecas_utilizadas: PecaUtilizada[]
  valor_pecas: number
  valor_mao_obra: number
  desconto: number
  valor_total: number
  status: StatusOS
  criado_em: string
  atualizado_em: string
  checklist_entrada?: ChecklistEntrada | ChecklistEntradaLegado
  valor_estimado?: number
  data_orcamento?: string
  status_orcamento?: StatusOrcamento
  quilometragem_entrada?: number
  quilometragem_saida?: number
  dias_garantia?: number
  data_vencimento_garantia?: string
  observacoes_garantia?: string
  data_previsao?: string
  responsavel?: string
  fotos?: FotoOS[]
  status_financeiro?: StatusFinanceiroOS
  vencimento_pagamento?: string
  observacoes_pagamento?: string
}

export type OrdemServicoInput = Omit<
  OrdemServico,
  'id' | 'oficina_id' | 'office_id' | 'numero' | 'valor_total' | 'criado_em' | 'atualizado_em' | 'created_at' | 'updated_at'
>

/** Garantia — entidade lógica derivada de OrdemServico (campos dias_garantia / data_vencimento_garantia) */
export interface Garantia {
  id: string
  ordem_servico_id: string
  moto_id: string
  cliente_id: string
  office_id: string
  dias_garantia: number
  data_inicio: string
  data_vencimento: string
  ativa: boolean
}

/** Registro de quilometragem — entidade lógica derivada de OrdemServico */
export interface RegistroQuilometragem {
  id: string
  ordem_servico_id: string
  moto_id: string
  office_id: string
  quilometragem_entrada?: number
  quilometragem_saida?: number
  data: string
}
