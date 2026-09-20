import { obterIdentidadeApp } from '../../lib/app-versao'

function agoraIso(): string {
  return new Date().toISOString()
}

function identidadeLogAgenda(): { versao: string; build: string } {
  const id = obterIdentidadeApp()
  return { versao: id.versaoAmigavel, build: id.buildCurto }
}

/** Tabelas com office_id assinadas no mesmo channel. */
export const TABELAS_REALTIME_OFFICE = [
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

export type StatusRealtimeVisivel =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'JOINED'
  | 'ERRORED'
  | string

export function nomeChannelRealtimeOffice(officeUuid: string): string {
  return `boxgestor-office-${officeUuid}`
}

export function appointmentsEstaNoBinding(
  tabelas: readonly string[] = TABELAS_REALTIME_OFFICE
): boolean {
  return tabelas.includes('appointments')
}

export function bindingsRealtimeUnicos(
  tabelas: readonly string[] = TABELAS_REALTIME_OFFICE
): boolean {
  return new Set(tabelas).size === tabelas.length
}

export function listarBindingsRealtime(officeUuid: string): Array<{
  schema: 'public'
  event: '*'
  table: string
  filter: string
}> {
  return TABELAS_REALTIME_OFFICE.map((table) => ({
    schema: 'public',
    event: '*' as const,
    table,
    filter: `office_id=eq.${officeUuid}`,
  }))
}

export function statusRealtimeVisivel(status: string): boolean {
  const n = normalizarStatusRealtime(status)
  return n === 'SUBSCRIBED' || n === 'CHANNEL_ERROR' || n === 'TIMED_OUT' || n === 'CLOSED'
}

export function textoStatusRealtime(status: string, channelName: string): string {
  return `status=${status} channel=${channelName}`
}

export function normalizarStatusRealtime(status: string | undefined | null): string {
  const s = String(status ?? 'UNKNOWN').trim() || 'UNKNOWN'
  return s.toUpperCase()
}

/** Política recomendada — ainda NÃO aplicada no cleanup real. */
export function cleanupDeveRemoverChannel(op: {
  geracaoCleanup: number
  geracaoAtiva: number
  channelCleanup: unknown
  channelAtivo: unknown
}): boolean {
  return op.geracaoCleanup === op.geracaoAtiva && op.channelCleanup === op.channelAtivo
}

export function classificarHttp400(url: string): 'realtime' | 'auth' | 'rest' | 'outro' {
  const path = pathHttpSanitizado(url)
  if (/\/realtime\//i.test(path) || /websocket/i.test(path)) return 'realtime'
  if (/\/auth\/v1\//i.test(path)) return 'auth'
  if (/\/rest\/v1\//i.test(path)) return 'rest'
  return 'outro'
}

export function pathHttpSanitizado(url: string): string {
  try {
    const u = new URL(url, 'https://local.invalid')
    return u.pathname
  } catch {
    return 'invalid'
  }
}

export function sanitizarMotivoRealtime(erro: unknown): string | null {
  if (!erro) return null
  if (typeof erro === 'string') return erro.slice(0, 160)
  if (erro instanceof Error) return erro.message.slice(0, 160)
  if (typeof erro === 'object' && erro && 'message' in erro) {
    return String((erro as { message?: unknown }).message ?? '').slice(0, 160) || null
  }
  return null
}

export interface SnapshotRealtime {
  em: string
  officeId: string
  channelName: string | null
  status: string
  channelState: string | null
  socketConnected: boolean | null
  appointmentsBinding: boolean
  appointmentsEventosRecebidos: number
  geracaoAtiva: number | null
  geracaoCleanup: number | null
}

export function logRealtimeStatus(detalhe: {
  status: string
  channelName: string
  officeId: string
  channelState?: string | null
  socketConnected?: boolean | null
  motivo?: string | null
  geracao?: number | null
  appointmentsBinding?: boolean
  appointmentsEventosRecebidos?: number
  appointmentsEventReceived?: 'sim' | 'nao'
}): void {
  const id = identidadeLogAgenda()
  const status = normalizarStatusRealtime(detalhe.status)
  console.info(`[BoxGestor Sync][realtime] ${textoStatusRealtime(status, detalhe.channelName)}`, {
    em: agoraIso(),
    officeId: detalhe.officeId,
    versao: id.versao,
    build: id.build,
    channelState: detalhe.channelState ?? null,
    socketConnected: detalhe.socketConnected ?? null,
    motivo: detalhe.motivo ?? null,
    geracao: detalhe.geracao ?? null,
    appointmentsBinding: detalhe.appointmentsBinding ?? appointmentsEstaNoBinding(),
    appointmentsEventosRecebidos: detalhe.appointmentsEventosRecebidos ?? 0,
    appointmentsEventReceived: detalhe.appointmentsEventReceived ?? 'nao',
  })
}

export function logHttp400Realtime(url: string, status: number): void {
  if (status !== 400) return
  const categoria = classificarHttp400(url)
  if (categoria === 'outro') return
  const id = identidadeLogAgenda()
  console.info('[BoxGestor Sync][http]', {
    em: agoraIso(),
    status: 400,
    categoria,
    path: pathHttpSanitizado(url),
    versao: id.versao,
    build: id.build,
  })
}

let observadorHttpInstalado = false

export function instalarObservadorHttpRealtime(): void {
  if (observadorHttpInstalado || typeof window === 'undefined') {
    return
  }
  observadorHttpInstalado = true
  if (typeof window.fetch === 'function') {
    const original = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await original(input, init)
      try {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input instanceof Request
                ? input.url
                : ''
        if (res.status === 400 && url) logHttp400Realtime(url, 400)
      } catch {
        /* observabilidade */
      }
      return res
    }
  }
  const OrigWs = window.WebSocket
  if (typeof OrigWs === 'function') {
    window.WebSocket = class WebSocketObservado extends OrigWs {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        const path = pathHttpSanitizado(String(url))
        this.addEventListener('error', () => {
          const id = identidadeLogAgenda()
          console.info('[BoxGestor Sync][http] websocket_error', {
            em: agoraIso(),
            categoria: classificarHttp400(path),
            path,
            versao: id.versao,
            build: id.build,
          })
        })
      }
    }
  }
}

export function resetarObservadorHttpRealtimeParaTeste(): void {
  observadorHttpInstalado = false
}

const observacoes = new Map<string, ReturnType<typeof setInterval>>()

export function pararObservacaoRealtime(officeId: string): void {
  const id = observacoes.get(officeId)
  if (id) clearInterval(id)
  observacoes.delete(officeId)
}

export function iniciarObservacaoRealtime(
  officeId: string,
  obterSnapshot: () => SnapshotRealtime,
  opcoes?: { duracaoMs?: number; intervaloMs?: number }
): void {
  pararObservacaoRealtime(officeId)
  const duracaoMs = opcoes?.duracaoMs ?? 60_000
  const intervaloMs = opcoes?.intervaloMs ?? 10_000
  const inicio = Date.now()

  const emitir = (rotulo: string) => {
    const snap = obterSnapshot()
    console.info(`[BoxGestor Sync][realtime] watch ${rotulo}`, {
      ...identidadeLogAgenda(),
      ...snap,
      appointmentsEventReceived: snap.appointmentsEventosRecebidos > 0 ? 'sim' : 'nao',
    })
  }

  emitir('inicio')
  const timer = setInterval(() => {
    emitir('tick')
    if (Date.now() - inicio >= duracaoMs) {
      emitir('fim')
      pararObservacaoRealtime(officeId)
    }
  }, intervaloMs)
  observacoes.set(officeId, timer)
}
