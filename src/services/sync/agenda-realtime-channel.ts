import type { RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js'
import { obterIdentidadeApp } from '../../lib/app-versao'
import { TABELAS_REALTIME_OFFICE } from './realtime-diagnostico'

export const PREFIXO_CHANNEL_AGENDA = 'boxgestor-agenda-'
export const PREFIXO_CHANNEL_AGENDA_CANARY_LEGADO = 'boxgestor-agenda-canary-'
export const FILTRO_OFFICE_ID_EQ = 'office_id=eq.'

export function nomeChannelAgenda(officeUuid: string): string {
  return `${PREFIXO_CHANNEL_AGENDA}${officeUuid}`
}

export function bindingAgendaAppointments(officeUuid: string): {
  event: '*'
  schema: 'public'
  table: 'appointments'
  filter: string
} {
  return {
    event: '*',
    schema: 'public',
    table: 'appointments',
    filter: `${FILTRO_OFFICE_ID_EQ}${officeUuid}`,
  }
}

export function bindingsAgendaUnicos(
  bindings: ReadonlyArray<{ table: string }>
): boolean {
  return bindings.length === 1 && bindings[0]?.table === 'appointments'
}

export function channelPrincipalContemAppointments(
  tabelas: readonly string[] = TABELAS_REALTIME_OFFICE
): boolean {
  return tabelas.includes('appointments')
}

export function qtdTabelasChannelPrincipal(
  tabelas: readonly string[] = TABELAS_REALTIME_OFFICE
): number {
  return tabelas.length
}

export function agendaUsaMesmoClient(
  agendaClient: unknown,
  principalClient: unknown
): boolean {
  return agendaClient != null && agendaClient === principalClient
}

export function destinoEventoChannelAgenda(
  tabela: string
): 'agenda' | 'global' | 'nenhum' {
  return tabela === 'appointments' ? 'agenda' : 'nenhum'
}

export function eventoAgendaDisparaSyncGlobal(): boolean {
  return false
}

export function outrasTabelasDisparamChannelAgenda(tabela: string): boolean {
  return tabela === 'appointments'
}

export function canaryAgendaDuplicadoAtivo(channelNames: readonly string[]): boolean {
  return channelNames.some((n) => n.startsWith(PREFIXO_CHANNEL_AGENDA_CANARY_LEGADO))
}

export function statusChannelPermiteRecriar(
  status?: string | null,
  channelState?: string | null
): boolean {
  const s = String(status ?? '').toUpperCase()
  const st = String(channelState ?? '').toLowerCase()
  return (
    s === 'CLOSED' ||
    s === 'CHANNEL_ERROR' ||
    s === 'TIMED_OUT' ||
    st === 'closed' ||
    st === 'errored'
  )
}

export function cleanupAgendaDeveRemover(op: {
  geracaoCleanup: number
  geracaoAtiva: number
  channelCleanup: unknown
  channelAtivo: unknown
}): boolean {
  return op.geracaoCleanup === op.geracaoAtiva && op.channelCleanup === op.channelAtivo
}

export interface AuthRealtimeBooleano {
  sessionPresente: boolean
  accessTokenPresente: boolean
  realtimeAccessTokenConfigurado: boolean
  socketConnected: boolean | null
  sessaoProntaAntesDoSubscribe: boolean
  mesmoClient: boolean
}

export function realtimeAccessTokenConfigurado(realtime: unknown): boolean {
  if (!realtime || typeof realtime !== 'object') return false
  const r = realtime as { accessTokenValue?: unknown; accessToken?: unknown }
  if (typeof r.accessTokenValue === 'string' && r.accessTokenValue.length > 0) return true
  if (typeof r.accessToken === 'function') return true
  if (typeof r.accessToken === 'string' && r.accessToken.length > 0) return true
  return false
}

export function capturarAuthRealtimeBooleano(op: {
  session: Session | null | undefined
  supabase: { realtime?: unknown } | null | undefined
  clientEsperado?: unknown
  sessaoProntaAntesDoSubscribe: boolean
  socketConnected?: boolean | null
}): AuthRealtimeBooleano {
  const token = op.session?.access_token
  return {
    sessionPresente: Boolean(op.session?.access_token && op.session.user?.id),
    accessTokenPresente: Boolean(token && token.length > 0),
    realtimeAccessTokenConfigurado: realtimeAccessTokenConfigurado(op.supabase?.realtime),
    socketConnected: op.socketConnected ?? null,
    sessaoProntaAntesDoSubscribe: op.sessaoProntaAntesDoSubscribe,
    mesmoClient: agendaUsaMesmoClient(op.supabase, op.clientEsperado ?? op.supabase),
  }
}

function agoraIso(): string {
  return new Date().toISOString()
}

function identidade(): { versao: string; build: string } {
  const id = obterIdentidadeApp()
  return { versao: id.versaoAmigavel, build: id.buildCurto }
}

function delayFromRemoteMs(
  remoteUpdatedAt: string | null | undefined,
  receivedAt: string
): number | null {
  if (!remoteUpdatedAt?.trim()) return null
  const remoto = Date.parse(remoteUpdatedAt)
  const recebido = Date.parse(receivedAt)
  if (Number.isNaN(remoto) || Number.isNaN(recebido)) return null
  return recebido - remoto
}

function socketConectado(
  supabase: { realtime?: { isConnected?: () => boolean } } | null
): boolean | null {
  try {
    return supabase?.realtime?.isConnected?.() ?? null
  } catch {
    return null
  }
}

function estadoChannel(channel: RealtimeChannel | null): string | null {
  try {
    return channel?.state ?? null
  } catch {
    return null
  }
}

function sanitizarMotivo(erro: unknown): string | null {
  if (!erro) return null
  if (typeof erro === 'string') return erro.slice(0, 160)
  if (erro instanceof Error) return erro.message.slice(0, 160)
  return null
}

interface EstadoAgendaChannel {
  channel: RealtimeChannel | null
  channelName: string
  client: SupabaseClient
  officeUuid: string
  geracao: number
  ultimoStatus: string | null
}

const estados = new Map<string, EstadoAgendaChannel>()

export function resetarChannelAgendaParaTeste(): void {
  estados.clear()
}

export function obterGeracaoAgendaParaTeste(officeId: string): number {
  return estados.get(officeId)?.geracao ?? 0
}

export function logAuthRealtimeBooleano(
  origem: 'principal' | 'agenda',
  officeId: string,
  auth: AuthRealtimeBooleano
): void {
  const id = identidade()
  console.info(
    origem === 'agenda' ? '[BoxGestor Agenda][realtime] auth' : '[BoxGestor Sync][realtime] auth',
    {
      em: agoraIso(),
      origem,
      officeId,
      versao: id.versao,
      build: id.build,
      ...auth,
    }
  )
}

export async function iniciarChannelAgendaRealtime(op: {
  officeId: string
  officeUuid: string
  supabase: SupabaseClient
  session: Session | null
  clientPrincipal?: SupabaseClient | null
}): Promise<void> {
  const clientPrincipal = op.clientPrincipal ?? op.supabase
  if (!agendaUsaMesmoClient(op.supabase, clientPrincipal)) {
    console.info('[BoxGestor Agenda][realtime] skip_client_diferente', {
      em: agoraIso(),
      officeId: op.officeId,
      ...identidade(),
    })
    return
  }

  const atual = estados.get(op.officeId)
  if (atual?.channel && !statusChannelPermiteRecriar(atual.ultimoStatus, estadoChannel(atual.channel))) {
    console.info('[BoxGestor Agenda][realtime] ja_ativo', {
      em: agoraIso(),
      officeId: op.officeId,
      channelName: atual.channelName,
      channelState: estadoChannel(atual.channel),
      geracao: atual.geracao,
      ...identidade(),
    })
    return
  }

  if (atual?.channel) {
    const morto = atual.channel
    try {
      await atual.client.removeChannel(morto)
    } catch {
      /* recriar */
    }
    if (estados.get(op.officeId)?.channel === morto) {
      atual.channel = null
    }
  }

  const geracao = (atual?.geracao ?? 0) + 1
  const binding = bindingAgendaAppointments(op.officeUuid)
  const channelName = nomeChannelAgenda(op.officeUuid)
  const auth = capturarAuthRealtimeBooleano({
    session: op.session,
    supabase: op.supabase,
    clientEsperado: clientPrincipal,
    sessaoProntaAntesDoSubscribe: Boolean(op.session),
    socketConnected: socketConectado(op.supabase),
  })
  logAuthRealtimeBooleano('agenda', op.officeId, auth)

  console.info('[BoxGestor Agenda][realtime] bindings', {
    em: agoraIso(),
    officeId: op.officeId,
    channelName,
    qtdBindings: 1,
    geracao,
    ...binding,
    ...identidade(),
  })

  let channel = op.supabase.channel(channelName)
  channel = channel.on('postgres_changes', binding, (payload) => {
    if (destinoEventoChannelAgenda('appointments') !== 'agenda') return
    if (eventoAgendaDisparaSyncGlobal()) return
    const rec = (payload.new ?? payload.old) as { id?: string; updated_at?: string } | null
    const receivedAt = agoraIso()
    const remoteUpdatedAt = rec?.updated_at
    console.info('[BoxGestor Agenda][realtime] APPOINTMENTS EVENT RECEIVED: sim', {
      ...identidade(),
      receivedAt,
      eventType: payload.eventType,
      appointmentId: rec?.id,
      remoteUpdatedAt,
      delayFromRemoteMs: delayFromRemoteMs(remoteUpdatedAt, receivedAt),
      geracao,
      channelName,
      officeId: op.officeId,
    })
    void import('@/services/agenda/agenda-realtime-pull').then((m) => {
      m.agendarPullAgendaRealtime(op.officeId, 'appointments', {
        eventType: payload.eventType,
        appointmentId: rec?.id,
      })
    })
  })

  channel.subscribe((status, err) => {
    const estado = estados.get(op.officeId)
    if (estado && estado.geracao === geracao) {
      estado.ultimoStatus = String(status).toUpperCase()
    }
    console.info(`[BoxGestor Agenda][realtime] status=${String(status).toUpperCase()}`, {
      em: agoraIso(),
      officeId: op.officeId,
      channelName,
      versao: identidade().versao,
      build: identidade().build,
      socketConnected: socketConectado(op.supabase),
      channelState: estadoChannel(channel),
      geracao,
      motivo: sanitizarMotivo(err),
    })
    console.info(`[BoxGestor Agenda][realtime] REALTIME CHANNEL: ${String(status).toUpperCase()}`)
  })

  estados.set(op.officeId, {
    channel,
    channelName,
    client: op.supabase,
    officeUuid: op.officeUuid,
    geracao,
    ultimoStatus: 'JOINING',
  })
}

export async function pararChannelAgendaRealtime(
  officeId: string,
  geracaoCleanup?: number
): Promise<void> {
  const estado = estados.get(officeId)
  if (!estado?.channel) return

  const alvo = estado.channel
  const geracaoAlvo = estado.geracao
  const geracao = geracaoCleanup ?? geracaoAlvo

  if (
    !cleanupAgendaDeveRemover({
      geracaoCleanup: geracao,
      geracaoAtiva: estado.geracao,
      channelCleanup: alvo,
      channelAtivo: estado.channel,
    })
  ) {
    console.info('[BoxGestor Agenda][realtime] cleanup_stale_ignorado', {
      em: agoraIso(),
      officeId,
      geracaoCleanup: geracao,
      geracaoAtiva: estado.geracao,
      ...identidade(),
    })
    return
  }

  console.info('[BoxGestor Agenda][realtime] unsubscribe', {
    em: agoraIso(),
    officeId,
    channelName: estado.channelName,
    channelState: estadoChannel(alvo),
    geracao: geracaoAlvo,
    ...identidade(),
  })

  try {
    await estado.client.removeChannel(alvo)
  } catch {
    /* cleanup */
  }

  const depois = estados.get(officeId)
  if (depois && depois.channel === alvo && depois.geracao === geracaoAlvo) {
    depois.channel = null
    depois.ultimoStatus = 'CLOSED'
    estados.delete(officeId)
  }
}
