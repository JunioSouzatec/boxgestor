import { filtrarEntidadesAtivas } from '@/lib/entidade-ativa'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import { localCraftRepository } from '@/services/repository/local.repository'
import { getActiveSyncPendingCount } from '@/services/pagamentos/payment-pending-diagnostic.service'
import { getCraftPersistenceMode } from '@/lib/supabase'

const ULTIMO_PULL_KEY = 'boxgestor_sync_ultimo_pull_v1'

export type ModuloSync =
  | 'fase1'
  | 'estoque'
  | 'pagamentos'
  | 'comunicacao'
  | 'comissoes'
  | 'geral'

function lerMapaPull(): Record<string, Partial<Record<ModuloSync, string>>> {
  try {
    const raw = localStorage.getItem(ULTIMO_PULL_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, Partial<Record<ModuloSync, string>>>
  } catch {
    return {}
  }
}

export function registrarUltimoPullModulo(officeId: string, modulo: ModuloSync): void {
  try {
    const map = lerMapaPull()
    map[officeId] = { ...(map[officeId] ?? {}), [modulo]: new Date().toISOString() }
    localStorage.setItem(ULTIMO_PULL_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function obterUltimoPullModulo(officeId: string, modulo: ModuloSync): string | null {
  return lerMapaPull()[officeId]?.[modulo] ?? null
}

export function logSyncDiag(
  rotulo: string,
  officeId: string,
  extra?: Record<string, unknown>
): void {
  const db = localCraftRepository.carregar(officeId)
  const clientesAtivos = filtrarEntidadesAtivas(db.clientes ?? []).length
  const motosAtivas = filtrarEntidadesAtivas(db.motos ?? []).length
  const osAtivas = filtrarEntidadesAtivas(db.ordens_servico ?? []).length
  const pecasAtivas = filtrarEntidadesAtivas(db.pecas ?? []).length

  console.info(`[BoxGestor Sync][diag] ${rotulo}`, {
    officeId,
    officeIdConfig: db.configuracao?.office_id ?? db.configuracao?.id,
    persistencia: getCraftPersistenceMode(),
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    bundle:
      typeof document !== 'undefined'
        ? (document.querySelector('script[type="module"][src*="index-"]') as HTMLScriptElement | null)
            ?.src?.split('/')
            .pop() ?? null
        : null,
    locais: {
      clientesAtivos,
      motosAtivas,
      osAtivas,
      pecasAtivas,
      lancamentos: (db.lancamentos ?? []).length,
    },
    filaSyncBruta: syncQueueService.contarPendentes(officeId),
    pendenciasAtivas: getActiveSyncPendingCount(officeId, db),
    ultimoPullGeral: obterUltimoPullModulo(officeId, 'geral'),
    ultimoPullFase1: obterUltimoPullModulo(officeId, 'fase1'),
    ultimoPullEstoque: obterUltimoPullModulo(officeId, 'estoque'),
    ...extra,
  })
}

export function logSyncPull(
  officeId: string,
  motivo: string,
  extra?: Record<string, unknown>
): void {
  console.info(`[BoxGestor Sync][pull] ${motivo}`, { officeId, ...extra })
}

export function logSyncPush(
  officeId: string,
  motivo: string,
  extra?: Record<string, unknown>
): void {
  console.info(`[BoxGestor Sync][push] ${motivo}`, { officeId, ...extra })
}

export function logSyncRealtime(
  officeId: string,
  evento: string,
  extra?: Record<string, unknown>
): void {
  console.info(`[BoxGestor Sync][realtime] ${evento}`, { officeId, ...extra })
}

export function logSyncQueue(
  officeId: string,
  evento: string,
  extra?: Record<string, unknown>
): void {
  console.info(`[BoxGestor Sync][queue] ${evento}`, { officeId, ...extra })
}
