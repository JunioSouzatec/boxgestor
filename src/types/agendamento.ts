import type { TenantEntity } from '@/types/base'
import type { StatusAgendamento } from '@/types/enums'

export interface Agendamento extends TenantEntity {
  data: string
  horario: string
  cliente_id: string
  moto_id: string
  servico: string
  status: StatusAgendamento
  observacoes?: string
  ordem_servico_id?: string
  created_at?: string
  updated_at?: string
  /** Tombstone de exclusão lógica — UI não lista quando preenchido */
  deleted_at?: string | null
}

export type AgendamentoInput = Omit<
  Agendamento,
  'id' | 'oficina_id' | 'office_id' | 'created_at' | 'updated_at' | 'deleted_at'
>
