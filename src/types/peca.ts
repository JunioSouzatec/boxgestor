import type { TenantEntity } from '@/types/base'

export interface Peca extends TenantEntity {
  nome: string
  codigo: string
  marca: string
  custo: number
  preco_venda: number
  quantidade: number
  estoque_minimo: number
  created_at?: string
  updated_at?: string
}

export type PecaInput = Omit<Peca, 'id' | 'oficina_id' | 'office_id' | 'created_at' | 'updated_at'>
