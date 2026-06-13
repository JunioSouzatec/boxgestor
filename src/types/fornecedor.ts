import type { TenantEntity } from '@/types/base'

export interface Fornecedor extends TenantEntity {
  nome: string
  cnpj?: string
  telefone?: string
  whatsapp?: string
  email?: string
  endereco?: string
  cidade?: string
  estado?: string
  observacoes?: string
  ativo: boolean
  created_at?: string
  updated_at?: string
}

export type FornecedorInput = Omit<
  Fornecedor,
  'id' | 'oficina_id' | 'office_id' | 'created_at' | 'updated_at'
>
