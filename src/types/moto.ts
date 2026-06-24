import type { TenantTimestampedEntity } from '@/types/base'
import type { TipoVeiculo } from '@/lib/veiculo-campos-sync'

export interface Moto extends TenantTimestampedEntity {
  cliente_id: string
  /** Tipo do veículo cadastrado — relevante em oficinas de carros/mistas */
  tipo_veiculo?: TipoVeiculo
  marca: string
  modelo: string
  ano: number
  placa: string
  cor: string
  quilometragem: number
  chassi?: string
  combustivel?: string
  renavam?: string
  motor?: string
  cambio?: string
  observacoes?: string
  criado_em: string
}

export type MotoInput = Omit<Moto, 'id' | 'oficina_id' | 'office_id' | 'criado_em' | 'created_at' | 'updated_at'>
