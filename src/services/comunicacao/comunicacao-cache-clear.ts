import { COMUNICACAO_STORAGE_KEY } from '@/services/comunicacao/comunicacao.storage'
import { ALERTAS_COMUNICACAO_STORAGE_KEY } from '@/services/comunicacao/alertas-comunicacao.storage'

/** Remove caches locais de comunicação da oficina (antes de pull do Supabase). */
export function limparCachesComunicacaoOffice(officeId: string): void {
  try {
    const rawAlertas = localStorage.getItem(ALERTAS_COMUNICACAO_STORAGE_KEY)
    if (rawAlertas) {
      const store = JSON.parse(rawAlertas) as { version: number; offices: Record<string, unknown> }
      delete store.offices[officeId]
      localStorage.setItem(ALERTAS_COMUNICACAO_STORAGE_KEY, JSON.stringify(store))
    }
  } catch {
    /* ignore */
  }

  try {
    const rawHistorico = localStorage.getItem(COMUNICACAO_STORAGE_KEY)
    if (rawHistorico) {
      const store = JSON.parse(rawHistorico) as { version: number; historico: Record<string, unknown> }
      delete store.historico[officeId]
      localStorage.setItem(COMUNICACAO_STORAGE_KEY, JSON.stringify(store))
    }
  } catch {
    /* ignore */
  }
}
