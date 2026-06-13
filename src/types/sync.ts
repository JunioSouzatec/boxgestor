/** Fila de sincronização offline-first (preparação Supabase) */

export type SyncActionType = 'create' | 'update' | 'delete'

export type SyncEntity =
  | 'cliente'
  | 'moto'
  | 'ordem_servico'
  | 'peca'
  | 'lancamento'
  | 'agendamento'
  | 'configuracao'
  | 'usuario'
  | 'regra_lembrete'
  | 'lembrete'

export type SyncStatus = 'pendente' | 'sincronizado' | 'erro'

export interface SyncQueueItem {
  id: string
  office_id: string
  tipo_acao: SyncActionType
  entidade: SyncEntity
  entidade_id: string
  payload?: unknown
  criado_em: string
  atualizado_em: string
  status: SyncStatus
  erro_mensagem?: string
  tentativas: number
}

export interface SyncQueueStore {
  version: 1
  items: SyncQueueItem[]
}

export const SYNC_QUEUE_STORAGE_KEY = 'craft_sync_queue_v1'

export function getLabelSyncStatus(status: SyncStatus): string {
  const map: Record<SyncStatus, string> = {
    pendente: 'Pendente',
    sincronizado: 'Sincronizado',
    erro: 'Erro',
  }
  return map[status]
}

export function getLabelSyncEntity(entidade: SyncEntity): string {
  const map: Record<SyncEntity, string> = {
    cliente: 'Cliente',
    moto: 'Moto',
    ordem_servico: 'Ordem de serviço',
    peca: 'Peça',
    lancamento: 'Lançamento',
    agendamento: 'Agendamento',
    configuracao: 'Configuração',
    usuario: 'Usuário',
    regra_lembrete: 'Regra de lembrete',
    lembrete: 'Lembrete',
  }
  return map[entidade]
}
