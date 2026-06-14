import { syncQueueService } from '@/services/sync/sync-queue.service'

export interface LogCarregamentoSupabase {
  origem: 'supabase' | 'localStorage_fallback'
  clientesSupabase: number
  clientesLocaisAntes: number
  clientesAposDedup: number
  duplicadosRemovidos: number
  motos: number
  os: number
  filaPendentes: number
}

export function logCarregamentoSupabaseDev(info: LogCarregamentoSupabase): void {
  if (!import.meta.env.DEV) return
  console.info('[Craft Supabase] Carregamento fase 1', info)
}

export function logPersistenciaClienteDev(payload: {
  acao: 'insert' | 'update' | 'dedup_skip'
  localId: string
  officeId: string
  telefone?: string
  motivo?: string
}): void {
  if (!import.meta.env.DEV) return
  console.debug('[Craft Supabase] Cliente', payload)
}

export function contarFilaPendentes(officeId: string): number {
  return syncQueueService.contarPendentes(officeId)
}
