import { getSupabaseClient, getCraftPersistenceMode } from '@/lib/supabase'
import { isModoSupabaseExperimentalAtivo } from '@/services/repository/repository.factory'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { aguardarSessaoAuthSupabase } from '@/lib/supabase-session-ready'
import {
  logSyncDiag,
  logSyncPull,
  logSyncRealtime,
  registrarUltimoPullModulo,
} from '@/services/sync/sync-diagnostico'
import type { RealtimeChannel } from '@supabase/supabase-js'

export const SYNC_MULTI_DEVICE_PULL_EVENTO = 'boxgestor:sync-pull'

/** Tabelas com office_id — Realtime filtra por oficina (nunca mistura tenants). */
const TABELAS_REALTIME = [
  'customers',
  'motorcycles',
  'service_orders',
  'inventory_items',
  'inventory_movements',
  'suppliers',
  'financial_transactions',
  'communication_history',
  'communication_alerts',
  'scheduled_messages',
] as const

export type MotivoPull =
  | 'visibility'
  | 'online'
  | 'interval'
  | 'realtime'
  | 'manual'
  | 'bootstrap'

export type HandlerPullMultiDevice = (motivo: MotivoPull) => Promise<void>

interface EstadoSyncOffice {
  channel: RealtimeChannel | null
  handler: HandlerPullMultiDevice | null
  debounceTimer: ReturnType<typeof setTimeout> | undefined
  ultimoPullEm: number
  pullEmAndamento: boolean
}

const estados = new Map<string, EstadoSyncOffice>()

const DEBOUNCE_REALTIME_MS = 2500
const MIN_INTERVALO_PULL_MS = 12_000

function obterEstado(officeId: string): EstadoSyncOffice {
  let estado = estados.get(officeId)
  if (!estado) {
    estado = {
      channel: null,
      handler: null,
      debounceTimer: undefined,
      ultimoPullEm: 0,
      pullEmAndamento: false,
    }
    estados.set(officeId, estado)
  }
  return estado
}

function emitirEventoPull(officeId: string, motivo: MotivoPull): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(SYNC_MULTI_DEVICE_PULL_EVENTO, {
      detail: { officeId, motivo },
    })
  )
}

/**
 * Agenda pull reconciliado (debounce). Respeita intervalo mínimo para não martelar o servidor.
 * Nunca faz push — só puxa Supabase → merge → UI.
 */
export function agendarPullMultiDevice(
  officeId: string,
  motivo: MotivoPull,
  opcoes?: { forcar?: boolean; delayMs?: number }
): void {
  if (getCraftPersistenceMode() !== 'supabase' || !isModoSupabaseExperimentalAtivo()) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    logSyncPull(officeId, 'skip_offline', { motivo })
    return
  }

  const estado = obterEstado(officeId)
  const delay = opcoes?.delayMs ?? (motivo === 'realtime' ? DEBOUNCE_REALTIME_MS : 800)

  clearTimeout(estado.debounceTimer)
  estado.debounceTimer = setTimeout(() => {
    void executarPullMultiDevice(officeId, motivo, opcoes?.forcar === true)
  }, delay)
}

async function executarPullMultiDevice(
  officeId: string,
  motivo: MotivoPull,
  forcar: boolean
): Promise<void> {
  const estado = obterEstado(officeId)
  if (estado.pullEmAndamento) {
    logSyncPull(officeId, 'skip_em_andamento', { motivo })
    // Reagenda após o atual terminar
    clearTimeout(estado.debounceTimer)
    estado.debounceTimer = setTimeout(() => {
      void executarPullMultiDevice(officeId, motivo, forcar)
    }, DEBOUNCE_REALTIME_MS)
    return
  }

  const agora = Date.now()
  if (!forcar && agora - estado.ultimoPullEm < MIN_INTERVALO_PULL_MS) {
    logSyncPull(officeId, 'skip_intervalo_minimo', {
      motivo,
      msDesdeUltimo: agora - estado.ultimoPullEm,
    })
    return
  }

  if (!estado.handler) {
    emitirEventoPull(officeId, motivo)
    return
  }

  estado.pullEmAndamento = true
  estado.ultimoPullEm = agora
  logSyncPull(officeId, `inicio_${motivo}`, { forcar })
  logSyncDiag(`pull_${motivo}_antes`, officeId)

  try {
    await estado.handler(motivo)
    registrarUltimoPullModulo(officeId, 'geral')
    registrarUltimoPullModulo(officeId, 'fase1')
    logSyncDiag(`pull_${motivo}_depois`, officeId)
    logSyncPull(officeId, `ok_${motivo}`)
    emitirEventoPull(officeId, motivo)
  } catch (err) {
    console.warn('[BoxGestor Sync][pull] erro', { officeId, motivo, err })
    logSyncDiag(`pull_${motivo}_erro`, officeId, {
      erro: err instanceof Error ? err.message : String(err),
    })
  } finally {
    estado.pullEmAndamento = false
  }
}

/**
 * Assina Realtime filtrado por office_id.
 * Qualquer INSERT/UPDATE/DELETE nas tabelas da oficina agenda pull (não aplica payload cru).
 */
export async function iniciarRealtimeOffice(
  officeId: string,
  handler: HandlerPullMultiDevice
): Promise<void> {
  if (getCraftPersistenceMode() !== 'supabase' || !isModoSupabaseExperimentalAtivo()) return

  const sessao = await aguardarSessaoAuthSupabase({ tentativas: 8, intervaloMs: 250 })
  if (!sessao) {
    logSyncRealtime(officeId, 'skip_sem_sessao')
    return
  }

  const supabase = getSupabaseClient()
  if (!supabase) return

  const estado = obterEstado(officeId)
  estado.handler = handler

  if (estado.channel) {
    logSyncRealtime(officeId, 'ja_ativo')
    return
  }

  const contexto = await obterContextoOfficeSupabase(officeId)
  const officeUuid = contexto?.officeUuid ?? officeId

  const channelName = `boxgestor-office-${officeUuid}`
  let channel = supabase.channel(channelName)

  for (const table of TABELAS_REALTIME) {
    channel = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter: `office_id=eq.${officeUuid}`,
      },
      (payload) => {
        logSyncRealtime(officeId, 'evento', {
          table,
          eventType: payload.eventType,
          officeUuid,
        })
        agendarPullMultiDevice(officeId, 'realtime')
      }
    )
  }

  channel.subscribe((status) => {
    logSyncRealtime(officeId, 'subscribe_status', { status, officeUuid, channelName })
  })

  estado.channel = channel
  logSyncDiag('realtime_iniciado', officeId, { officeUuid, tabelas: TABELAS_REALTIME })
}

export async function pararRealtimeOffice(officeId: string): Promise<void> {
  const estado = estados.get(officeId)
  if (!estado) return

  clearTimeout(estado.debounceTimer)
  estado.handler = null

  if (estado.channel) {
    const supabase = getSupabaseClient()
    logSyncRealtime(officeId, 'unsubscribe')
    if (supabase) {
      await supabase.removeChannel(estado.channel)
    }
    estado.channel = null
  }
}

/** Atualiza o handler sem recriar o canal (ex.: CraftContext remount). */
export function registrarHandlerPullMultiDevice(
  officeId: string,
  handler: HandlerPullMultiDevice
): void {
  obterEstado(officeId).handler = handler
}
