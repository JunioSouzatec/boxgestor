import { limparEstadoSincronizacao } from '@/services/supabase-sync/sync-state.storage'

/** Limpa caches globais de sessão (não apaga dados por oficina em craft_tenants_v1). */
export function limparCacheVisualSessao(): void {
  try {
    limparEstadoSincronizacao()
  } catch {
    /* ignore */
  }
}
