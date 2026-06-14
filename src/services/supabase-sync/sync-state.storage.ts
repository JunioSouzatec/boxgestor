import type { ResultadoSincronizacaoSupabase } from '@/services/supabase-sync/supabase-sync.types'

const STORAGE_KEY = 'craft_supabase_sync_v1'

export interface EstadoSincronizacaoLocal {
  ultimaSincronizacao: string
  ultimoResultado: ResultadoSincronizacaoSupabase
}

export function carregarEstadoSincronizacao(): EstadoSincronizacaoLocal | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as EstadoSincronizacaoLocal
  } catch {
    return null
  }
}

export function salvarEstadoSincronizacao(estado: EstadoSincronizacaoLocal): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(estado))
}

export function limparEstadoSincronizacao(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
