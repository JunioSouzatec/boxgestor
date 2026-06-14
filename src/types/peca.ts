import type { TenantEntity } from '@/types/base'
import type { UnidadePecaOS } from '@/types/unidade-peca'

export type CategoriaPeca =
  | 'oleo'
  | 'filtro'
  | 'freio'
  | 'transmissao'
  | 'eletrica'
  | 'motor'
  | 'pneu'
  | 'suspensao'
  | 'arrefecimento'
  | 'acessorios'
  | 'outros'

export const CATEGORIAS_PECA: { value: CategoriaPeca; label: string }[] = [
  { value: 'oleo', label: 'Óleo' },
  { value: 'filtro', label: 'Filtro' },
  { value: 'freio', label: 'Freio' },
  { value: 'transmissao', label: 'Transmissão' },
  { value: 'eletrica', label: 'Elétrica' },
  { value: 'motor', label: 'Motor' },
  { value: 'pneu', label: 'Pneu' },
  { value: 'suspensao', label: 'Suspensão' },
  { value: 'arrefecimento', label: 'Arrefecimento / Refrigeração' },
  { value: 'acessorios', label: 'Acessórios' },
  { value: 'outros', label: 'Outros' },
]

export function getLabelCategoriaPeca(categoria: CategoriaPeca | string): string {
  return CATEGORIAS_PECA.find((c) => c.value === categoria)?.label ?? categoria
}

export interface Peca extends TenantEntity {
  nome: string
  codigo: string
  codigo_barras?: string
  marca: string
  categoria?: CategoriaPeca
  fornecedor_id?: string
  custo: number
  preco_venda: number
  quantidade: number
  estoque_minimo: number
  localizacao?: string
  observacao?: string
  /** Unidade padrão de venda/uso (litro, unidade, etc.) */
  unidade?: UnidadePecaOS
  ativo: boolean
  created_at?: string
  updated_at?: string
}

export type PecaInput = Omit<Peca, 'id' | 'oficina_id' | 'office_id' | 'created_at' | 'updated_at'>

export function calcularMargemLucroPeca(custo: number, precoVenda: number): number {
  if (precoVenda <= 0) return 0
  return ((precoVenda - custo) / precoVenda) * 100
}

export function calcularPrecoVendaPorMargem(custo: number, margemPercentual: number): number {
  if (margemPercentual >= 100) return custo * 2
  return custo / (1 - margemPercentual / 100)
}
