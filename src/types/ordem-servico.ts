import type { TenantTimestampedEntity } from '@/types/base'
import type { ChecklistEntrada, ChecklistEntradaLegado } from '@/types/checklist'
import type { ServicoOSItem } from '@/types/servico-catalogo'
import type { StatusFinanceiroOS, StatusOrcamento, StatusOS } from '@/types/enums'

import type { UnidadePecaOS } from '@/types/unidade-peca'

export interface PecaUtilizada {
  linha_id?: string
  peca_id?: string
  nome: string
  codigo?: string
  quantidade: number
  valor_unitario: number
  observacao?: string
  /** Peça digitada manualmente, sem vínculo obrigatório com estoque */
  manual?: boolean
  /** Marca pendência de compra quando estoque insuficiente na OS */
  pendencia_compra?: boolean
  /** Unidade de medida na OS */
  unidade?: UnidadePecaOS
  /** Serviço do catálogo que originou a sugestão */
  servico_item_id?: string
  sugestao_id?: string
}

export interface FotoOS {
  url: string
  tipo: 'antes' | 'depois'
  descricao?: string
}

export type MotivoAjusteMaoObraOS =
  | 'complexidade'
  | 'desconto'
  | 'combinado_cliente'
  | 'diagnostico_adicional'
  | 'outro'

export interface AjusteMaoObraOS {
  ativo: boolean
  motivo_tipo: MotivoAjusteMaoObraOS
  /** Texto livre — obrigatório quando ativo (especialmente para "outro") */
  motivo_texto: string
}

export const MOTIVOS_AJUSTE_MAO_OBRA: { value: MotivoAjusteMaoObraOS; label: string }[] = [
  { value: 'complexidade', label: 'Serviço mais complexo que o previsto' },
  { value: 'desconto', label: 'Desconto na mão de obra' },
  { value: 'combinado_cliente', label: 'Ajuste combinado com cliente' },
  { value: 'diagnostico_adicional', label: 'Diagnóstico adicional' },
  { value: 'outro', label: 'Outro' },
]

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
  valor_adicional?: number
  desconto: number
  valor_total: number
  status: StatusOS
  criado_em: string
  atualizado_em: string
  checklist_entrada?: ChecklistEntrada | ChecklistEntradaLegado
  valor_estimado?: number
  data_orcamento?: string
  status_orcamento?: StatusOrcamento
  observacoes_orcamento?: string
  quilometragem_entrada?: number
  quilometragem_saida?: number
  dias_garantia?: number
  data_vencimento_garantia?: string
  observacoes_garantia?: string
  /** Data em que a moto entrou na oficina (YYYY-MM-DD) */
  data_entrada?: string
  /** Previsão de entrega (YYYY-MM-DD) */
  data_previsao?: string
  /** Data de saída/entrega da moto (YYYY-MM-DD) */
  data_saida?: string
  responsavel?: string
  fotos?: FotoOS[]
  status_financeiro?: StatusFinanceiroOS
  vencimento_pagamento?: string
  observacoes_pagamento?: string
  servicos_itens?: ServicoOSItem[]
  /** Total de mão de obra diferente da soma dos serviços (com motivo) */
  ajuste_mao_obra?: AjusteMaoObraOS
  /** Indica que o estoque já foi baixado para esta OS */
  estoque_baixado?: boolean
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
