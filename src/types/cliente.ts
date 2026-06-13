import type { TenantTimestampedEntity } from '@/types/base'

export interface Cliente extends TenantTimestampedEntity {
  nome: string
  telefone: string
  cpf?: string
  endereco: string
  observacoes?: string
  /** criado_em é obrigatório na prática; definido pelo serviço ao criar */
  criado_em: string
}

export type ClienteInput = Omit<Cliente, 'id' | 'oficina_id' | 'office_id' | 'criado_em' | 'created_at' | 'updated_at'>
