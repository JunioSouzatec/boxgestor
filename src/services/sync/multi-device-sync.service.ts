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
import { limparHandlerPullAgenda } from '@/services/agenda/agenda-realtime-pull'
import { agoraIso } from '@/services/agenda/agenda-realtime-scheduler'
import {
  DEBOUNCE_REALTIME_MS,
  THROTTLE_FOCUS_MS,
  deveExecutarPullAgora,
  intervaloMinimoParaMotivo,
} from '@/services/sync/sync-pull-throttle'
import {
  TABELAS_REALTIME_OFFICE,
  appointmentsEstaNoBinding,
  iniciarObservacaoRealtime,
  instalarObservadorHttpRealtime,
  listarBindingsRealtime,
  logRealtimeStatus,
  nomeChannelRealtimeOffice,
  pararObservacaoRealtime,
  sanitizarMotivoRealtime,
  type SnapshotRealtime,
} from '@/services/sync/realtime-diagnostico'
import {
  capturarAuthRealtimeBooleano,
  iniciarChannelAgendaRealtime,
  logAuthRealtimeBooleano,
  pararChannelAgendaRealtime,
} from '@/services/sync/agenda-realtime-channel'

export { deveExecutarPullAgora, intervaloMinimoParaMotivo } from '@/services/sync/sync-pull-throttle'
export {
  TABELAS_REALTIME_OFFICE,
  appointmentsEstaNoBinding,
  listarBindingsRealtime,
  nomeChannelRealtimeOffice,
} from '@/services/sync/realtime-diagnostico'

export const SYNC_MULTI_DEVICE_PULL_EVENTO = 'boxgestor:sync-pull'

/** Tabelas com office_id — Realtime filtra por oficina (nunca mistura tenants). */
const TABELAS_REALTIME = TABELAS_REALTIME_OFFICE

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
  channelName: string | null
  handler: HandlerPullMultiDevice | null
  debounceTimer: ReturnType<typeof setTimeout> | undefined
  ultimoPullEm: number
  pullEmAndamento: boolean
  geracaoAtiva: number
  geracaoIniciando: number
  ultimoStatus: string | null
  appointmentsEventosRecebidos: number
}

const estados = new Map<string, EstadoSyncOffice>()



function obterEstado(officeId: string): EstadoSyncOffice {
  let estado = estados.get(officeId)
  if (!estado) {
    estado = {
      channel: null,
      channelName: null,
      handler: null,
      debounceTimer: undefined,
      ultimoPullEm: 0,
      pullEmAndamento: false,
      geracaoAtiva: 0,
      geracaoIniciando: 0,
      ultimoStatus: null,
      appointmentsEventosRecebidos: 0,
    }
    estados.set(officeId, estado)
  }
  return estado
}

/** Marca pull recente (ex.: bootstrap direto via carregarComSupabase). */
export function marcarPullMultiDeviceConcluido(officeId: string): void {
  obterEstado(officeId).ultimoPullEm = Date.now()
}

export function msDesdeUltimoPullMultiDevice(officeId: string): number {
  const ultimo = obterEstado(officeId).ultimoPullEm
  if (!ultimo) return Number.POSITIVE_INFINITY
  return Date.now() - ultimo
}

export function pullMultiDeviceRecente(
  officeId: string,
  janelaMs: number = THROTTLE_FOCUS_MS
): boolean {
  return msDesdeUltimoPullMultiDevice(officeId) < janelaMs
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
 * `forcar: true` (manual/online com pendências) ignora throttle.
 */
export function agendarPullMultiDevice(
  officeId: string,
  motivo: MotivoPull,
  opcoes?: { forcar?: boolean; delayMs?: number; tabela?: string }
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
  const minMs = intervaloMinimoParaMotivo(motivo)
  if (!deveExecutarPullAgora(motivo, estado.ultimoPullEm, agora, forcar)) {
    logSyncPull(officeId, 'skip_intervalo_minimo', {
      motivo,
      msDesdeUltimo: agora - estado.ultimoPullEm,
      minMs,
    })
    return
  }

  if (!estado.handler) {
    emitirEventoPull(officeId, motivo)
    return
  }

  estado.pullEmAndamento = true
  estado.ultimoPullEm = agora
  const pullInicio = performance.now()
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
    console.warn('[BoxGestor Agenda][pull]', {
      officeId,
      etapa: 'fim',
      motivo,
      ok: false,
      duracao_ms: Math.round(performance.now() - pullInicio),
    })
  } finally {
    estado.pullEmAndamento = false
  }
}

function socketRealtimeConectado(
  supabase: ReturnType<typeof getSupabaseClient>
): boolean | null {
  try {
    return supabase?.realtime?.isConnected() ?? null
  } catch {
    return null
  }
}

function estadoChannelTexto(channel: RealtimeChannel | null): string | null {
  try {
    return channel?.state ?? null
  } catch {
    return null
  }
}

function assinarChannelAgenda(
  officeId: string,
  officeUuid: string,
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  sessao: Awaited<ReturnType<typeof aguardarSessaoAuthSupabase>>
): void {
  logAuthRealtimeBooleano(
    'principal',
    officeId,
    capturarAuthRealtimeBooleano({
      session: sessao,
      supabase,
      clientEsperado: supabase,
      sessaoProntaAntesDoSubscribe: Boolean(sessao),
      socketConnected: socketRealtimeConectado(supabase),
    })
  )
  void iniciarChannelAgendaRealtime({
    officeId,
    officeUuid,
    supabase,
    session: sessao,
    clientPrincipal: supabase,
  })
}

export function capturarSnapshotRealtime(officeId: string): SnapshotRealtime {
  const estado = estados.get(officeId)
  const supabase = getSupabaseClient()
  return {
    em: agoraIso(),
    officeId,
    channelName: estado?.channelName ?? null,
    status: estado?.ultimoStatus ?? 'UNKNOWN',
    channelState: estadoChannelTexto(estado?.channel ?? null),
    socketConnected: socketRealtimeConectado(supabase),
    appointmentsBinding: appointmentsEstaNoBinding(),
    appointmentsEventosRecebidos: estado?.appointmentsEventosRecebidos ?? 0,
    geracaoAtiva: estado?.geracaoAtiva ?? null,
    geracaoCleanup: null,
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

  instalarObservadorHttpRealtime()

  const estado = obterEstado(officeId)
  estado.handler = handler
  estado.geracaoIniciando += 1
  const geracao = estado.geracaoIniciando

  logSyncRealtime(officeId, 'iniciando', {
    geracao,
    geracaoAtiva: estado.geracaoAtiva,
    channelState: estadoChannelTexto(estado.channel),
    ultimoStatus: estado.ultimoStatus,
  })

  const sessao = await aguardarSessaoAuthSupabase({ tentativas: 8, intervaloMs: 250 })
  if (!sessao) {
    logSyncRealtime(officeId, 'skip_sem_sessao', { geracao })
    return
  }

  const supabase = getSupabaseClient()
  if (!supabase) return

  if (estado.channel) {
    const channelState = estadoChannelTexto(estado.channel)
    logSyncRealtime(officeId, 'ja_ativo', {
      geracao,
      geracaoAtiva: estado.geracaoAtiva,
      channelName: estado.channelName,
      channelState,
      ultimoStatus: estado.ultimoStatus,
      socketConnected: socketRealtimeConectado(supabase),
      channelInativo:
        channelState === 'closed' ||
        channelState === 'errored' ||
        estado.ultimoStatus === 'CLOSED' ||
        estado.ultimoStatus === 'CHANNEL_ERROR' ||
        estado.ultimoStatus === 'TIMED_OUT',
    })
    const contextoAtivo = await obterContextoOfficeSupabase(officeId)
    assinarChannelAgenda(
      officeId,
      contextoAtivo?.officeUuid ?? officeId,
      supabase,
      sessao
    )
    return
  }

  const contexto = await obterContextoOfficeSupabase(officeId)
  const officeUuid = contexto?.officeUuid ?? officeId

  const channelName = nomeChannelRealtimeOffice(officeUuid)
  const bindings = listarBindingsRealtime(officeUuid)
  logSyncRealtime(officeId, 'bindings', {
    geracao,
    channelName,
    schema: 'public',
    event: '*',
    tabelas: TABELAS_REALTIME,
    appointmentsBinding: appointmentsEstaNoBinding(TABELAS_REALTIME) ? 'sim' : 'nao',
    filter: `office_id=eq.${officeUuid}`,
    qtdBindings: bindings.length,
  })

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
        const rec = (payload.new ?? payload.old) as
          | { id?: string; updated_at?: string }
          | null
        logSyncRealtime(officeId, 'evento', {
          table,
          eventType: payload.eventType,
          id: rec?.id,
          updated_at: rec?.updated_at,
          officeUuid,
          geracao: estado.geracaoAtiva,
        })
        agendarPullMultiDevice(officeId, 'realtime', { tabela: table })
      }
    )
  }

  channel.subscribe((status, err) => {
    estado.ultimoStatus = status
    logRealtimeStatus({
      status,
      channelName,
      officeId,
      channelState: estadoChannelTexto(channel),
      socketConnected: socketRealtimeConectado(supabase),
      motivo: sanitizarMotivoRealtime(err),
      geracao: estado.geracaoAtiva,
      appointmentsBinding: false,
      appointmentsEventosRecebidos: estado.appointmentsEventosRecebidos,
      appointmentsEventReceived: estado.appointmentsEventosRecebidos > 0 ? 'sim' : 'nao',
    })
    console.info(`[BoxGestor Sync][realtime] REALTIME CHANNEL: ${String(status).toUpperCase()}`)
  })

  if (estado.channel && estado.channel !== channel) {
    logSyncRealtime(officeId, 'subscribe_apos_outro_channel', {
      geracao,
      geracaoAtiva: estado.geracaoAtiva,
      channelNovo: channelName,
      channelAtivo: estado.channelName,
    })
  }

  estado.channel = channel
  estado.channelName = channelName
  estado.geracaoAtiva = geracao
  estado.appointmentsEventosRecebidos = 0
  estado.ultimoStatus = estado.ultimoStatus ?? 'JOINING'
  logSyncDiag('realtime_iniciado', officeId, {
    officeUuid,
    tabelas: TABELAS_REALTIME,
    geracao,
    channelName,
    appointmentsBinding: 'nao',
  })
  iniciarObservacaoRealtime(officeId, () => capturarSnapshotRealtime(officeId), {
    duracaoMs: 60_000,
    intervaloMs: 10_000,
  })
  assinarChannelAgenda(officeId, officeUuid, supabase, sessao)
}

export async function pararRealtimeOffice(officeId: string): Promise<void> {
  const estado = estados.get(officeId)
  if (!estado) return

  clearTimeout(estado.debounceTimer)
  estado.handler = null
  limparHandlerPullAgenda(officeId)
  pararObservacaoRealtime(officeId)
  await pararChannelAgendaRealtime(officeId)

  const geracaoCleanup = estado.geracaoAtiva
  const channelCleanup = estado.channel
  const channelNameCleanup = estado.channelName

  if (estado.channel) {
    const supabase = getSupabaseClient()
    logSyncRealtime(officeId, 'unsubscribe', {
      geracaoCleanup,
      geracaoAtiva: estado.geracaoAtiva,
      channelName: channelNameCleanup,
      channelState: estadoChannelTexto(channelCleanup),
      ultimoStatus: estado.ultimoStatus,
      cleanupMesmoChannel: estado.channel === channelCleanup,
    })
    if (estado.geracaoAtiva !== geracaoCleanup || estado.channel !== channelCleanup) {
      logSyncRealtime(officeId, 'cleanup_stale_vs_ativo', {
        geracaoCleanup,
        geracaoAtiva: estado.geracaoAtiva,
        channelCleanup: channelNameCleanup,
        channelAtivo: estado.channelName,
      })
    }
    if (supabase) {
      await supabase.removeChannel(estado.channel)
    }
    if (estado.channel !== channelCleanup) {
      logSyncRealtime(officeId, 'cleanup_removeu_apos_novo_subscribe', {
        geracaoCleanup,
        geracaoAtiva: estado.geracaoAtiva,
        channelRemovido: channelNameCleanup,
        channelAtual: estado.channelName,
      })
    }
    estado.channel = null
    estado.channelName = null
    estado.ultimoStatus = 'CLOSED'
  }
}

/** Atualiza o handler sem recriar o canal (ex.: CraftContext remount). */
export function registrarHandlerPullMultiDevice(
  officeId: string,
  handler: HandlerPullMultiDevice
): void {
  obterEstado(officeId).handler = handler
}
