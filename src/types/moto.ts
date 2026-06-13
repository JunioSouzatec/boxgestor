import type { TenantTimestampedEntity } from '@/types/base'

export interface Moto extends TenantTimestampedEntity {
  cliente_id: string
  marca: string
  modelo: string
  ano: number
  placa: string
  cor: string
  quilometragem: number
  chassi?: string
  observacoes?: string
  criado_em: string
}

export type MotoInput = Omit<Moto, 'id' | 'oficina_id' | 'office_id' | 'criado_em' | 'created_at' | 'updated_at'>
