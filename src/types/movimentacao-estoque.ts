import type { TenantEntity } from '@/types/base'

export type TipoMovimentacaoEstoque = 'entrada' | 'saida' | 'ajuste' | 'devolucao'

export const TIPOS_MOVIMENTACAO_ESTOQUE: {
  value: TipoMovimentacaoEstoque
  label: string
}[] = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'saida', label: 'Saída' },
  { value: 'ajuste', label: 'Ajuste' },
  { value: 'devolucao', label: 'Devolução' },
]

export const MOTIVOS_AJUSTE_ESTOQUE = [
  'Conferência de estoque',
  'Peça perdida',
  'Peça danificada',
  'Correção de cadastro',
  'Devolução',
] as const

export type MotivoAjusteEstoque = (typeof MOTIVOS_AJUSTE_ESTOQUE)[number]

export function getLabelTipoMovimentacao(tipo: TipoMovimentacaoEstoque | string): string {
  return TIPOS_MOVIMENTACAO_ESTOQUE.find((t) => t.value === tipo)?.label ?? tipo
}

export interface MovimentacaoEstoque extends TenantEntity {
  peca_id: string
  peca_nome: string
  tipo: TipoMovimentacaoEstoque
  quantidade: number
  valor_unitario: number
  valor_total: number
  data: string
  fornecedor_id?: string
  fornecedor_nome?: string
  ordem_servico_id?: string
  ordem_servico_numero?: number
  numero_nota?: string
  motivo?: string
  observacao?: string
  usuario_id?: string
  usuario_nome?: string
  created_at?: string
}

export type MovimentacaoEstoqueInput = Omit<
  MovimentacaoEstoque,
  'id' | 'oficina_id' | 'office_id' | 'valor_total' | 'created_at'
>

export interface EntradaEstoqueInput {
  peca_id: string
  fornecedor_id?: string
  quantidade: number
  custo_unitario: number
  data_compra: string
  numero_nota?: string
  observacao?: string
}

export interface AjusteEstoqueInput {
  peca_id: string
  quantidade_nova: number
  motivo: string
  observacao?: string
}

export interface UsuarioMovimentacao {
  id?: string
  nome?: string
}
