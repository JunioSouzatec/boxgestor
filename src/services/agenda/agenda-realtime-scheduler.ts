import { obterIdentidadeApp } from '@/lib/app-versao'

export const DEBOUNCE_AGENDA_REALTIME_MS = 500

export function destinoPullRealtime(tabela: string): 'agenda' | 'global' {
  return tabela === 'appointments' ? 'agenda' : 'global'
}

export interface ResultadoAgendarPullAgenda {
  destino: 'agenda' | 'global'
  agendaAgendada: boolean
  timerAgendaReiniciado: boolean
  delayMs: number
  marcouTrailing: boolean
}

export interface ContextoAgendarPullAgenda {
  eventType?: string
  appointmentId?: string
  pullEmAndamento?: boolean
  marcarTrailing?: () => void
}

export function identidadeLogAgenda(): { versao: string; build: string } {
  const id = obterIdentidadeApp()
  return { versao: id.versaoAmigavel, build: id.buildCurto }
}

export function logAgendaScheduler(detalhe: Record<string, unknown>): void {
  console.info('[BoxGestor Agenda][scheduler]', { ...identidadeLogAgenda(), ...detalhe })
}

export function agoraIso(): string {
  return new Date().toISOString()
}

export function delayFromRemoteMs(
  remoteUpdatedAt: string | null | undefined,
  receivedAt: string
): number | null {
  if (!remoteUpdatedAt?.trim()) return null
  const remoto = Date.parse(remoteUpdatedAt)
  const recebido = Date.parse(receivedAt)
  if (Number.isNaN(remoto) || Number.isNaN(recebido)) return null
  return recebido - remoto
}

export function criarSchedulerPullAgenda(deps: {
  debounceMs?: number
  agendarTimer: (fn: () => void, ms: number) => unknown
  cancelarTimer: (id: unknown) => void
  executarPull: () => void
}): {
  agendar(tabela: string, contexto?: ContextoAgendarPullAgenda): ResultadoAgendarPullAgenda
  cancelar(): void
} {
  const delayMs = deps.debounceMs ?? DEBOUNCE_AGENDA_REALTIME_MS
  let timer: unknown

  return {
    agendar(tabela: string, contexto?: ContextoAgendarPullAgenda): ResultadoAgendarPullAgenda {
      const destino = destinoPullRealtime(tabela)
      const pullEmAndamento = Boolean(contexto?.pullEmAndamento)
      const scheduledAt = agoraIso()

      if (destino !== 'agenda') {
        logAgendaScheduler({
          scheduledAt,
          delayMs,
          timerReset: false,
          pullEmAndamento,
          marcouTrailing: false,
          sourceEventType: contexto?.eventType ?? null,
          appointmentId: contexto?.appointmentId ?? null,
          motivo: 'outras_tabelas',
          tabela,
        })
        return {
          destino: 'global',
          agendaAgendada: false,
          timerAgendaReiniciado: false,
          delayMs,
          marcouTrailing: false,
        }
      }

      if (pullEmAndamento) {
        contexto?.marcarTrailing?.()
        logAgendaScheduler({
          scheduledAt,
          delayMs,
          timerReset: false,
          pullEmAndamento: true,
          marcouTrailing: true,
          sourceEventType: contexto?.eventType ?? null,
          appointmentId: contexto?.appointmentId ?? null,
          motivo: 'agenda_realtime',
          tabela,
        })
        return {
          destino: 'agenda',
          agendaAgendada: false,
          timerAgendaReiniciado: false,
          delayMs,
          marcouTrailing: true,
        }
      }

      const timerReset = timer !== undefined
      if (timer !== undefined) deps.cancelarTimer(timer)
      timer = deps.agendarTimer(() => {
        timer = undefined
        deps.executarPull()
      }, delayMs)

      logAgendaScheduler({
        scheduledAt,
        delayMs,
        timerReset,
        pullEmAndamento: false,
        marcouTrailing: false,
        sourceEventType: contexto?.eventType ?? null,
        appointmentId: contexto?.appointmentId ?? null,
        motivo: 'agenda_realtime',
        tabela,
      })

      return {
        destino: 'agenda',
        agendaAgendada: true,
        timerAgendaReiniciado: timerReset,
        delayMs,
        marcouTrailing: false,
      }
    },
    cancelar() {
      if (timer === undefined) return
      deps.cancelarTimer(timer)
      timer = undefined
    },
  }
}
