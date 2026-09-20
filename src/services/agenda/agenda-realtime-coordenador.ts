import { aplicarPullAgendaDirecionado } from '@/services/agenda/agenda-realtime-pull-core'
import {
  criarSchedulerPullAgenda,
  DEBOUNCE_AGENDA_REALTIME_MS,
  type ContextoAgendarPullAgenda,
  type ResultadoAgendarPullAgenda,
} from '@/services/agenda/agenda-realtime-scheduler'
import type { Agendamento } from '@/types'
import type { CraftDatabase } from '@/types/database'

export interface ResultadoSelectAgendaPull {
  ok: boolean
  dados: Agendamento[] | null
}

export interface PullAgendaDirecionadoDeps {
  carregarLocal: (officeId: string) => CraftDatabase
  carregarRemoto: (officeId: string) => Promise<ResultadoSelectAgendaPull>
  salvarLocal: (officeId: string, db: CraftDatabase) => void
  onUi?: (officeId: string, agendamentos: Agendamento[]) => void
}

export interface CoordenadorPullAgenda {
  agendar(
    tabela: string,
    contexto?: Omit<ContextoAgendarPullAgenda, 'pullEmAndamento' | 'marcarTrailing'>
  ): ResultadoAgendarPullAgenda
  executar(
    deps?: Partial<PullAgendaDirecionadoDeps>,
    opcoes?: { trailing?: boolean }
  ): Promise<Agendamento[] | null>
  cancelar(): void
  estaPullEmAndamento(): boolean
  estaSuja(): boolean
  pullsIniciados(): number
}

function novoPullId(): string {
  return `agp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function criarCoordenadorPullAgenda(
  officeId: string,
  extras: {
    debounceMs?: number
    agendarTimer?: (fn: () => void, ms: number) => unknown
    cancelarTimer?: (id: unknown) => void
  } & PullAgendaDirecionadoDeps
): CoordenadorPullAgenda {
  let suja = false
  let cancelado = false
  let ciclo: Promise<Agendamento[] | null> | null = null
  let pullsIniciados = 0
  const depsPadrao: PullAgendaDirecionadoDeps = {
    carregarLocal: extras.carregarLocal,
    carregarRemoto: extras.carregarRemoto,
    salvarLocal: extras.salvarLocal,
    onUi: extras.onUi,
  }

  const scheduler = criarSchedulerPullAgenda({
    debounceMs: extras.debounceMs ?? DEBOUNCE_AGENDA_REALTIME_MS,
    agendarTimer: extras.agendarTimer ?? ((fn, ms) => setTimeout(fn, ms)),
    cancelarTimer:
      extras.cancelarTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>)),
    executarPull: () => {
      void executarInterno(undefined, { trailing: false })
    },
  })

  function consumirSuja(): boolean {
    if (!suja) return false
    suja = false
    return true
  }

  function resolverDeps(override?: Partial<PullAgendaDirecionadoDeps>): PullAgendaDirecionadoDeps {
    return {
      carregarLocal: override?.carregarLocal ?? depsPadrao.carregarLocal,
      carregarRemoto: override?.carregarRemoto ?? depsPadrao.carregarRemoto,
      salvarLocal: override?.salvarLocal ?? depsPadrao.salvarLocal,
      onUi: override?.onUi ?? depsPadrao.onUi,
    }
  }

  async function rodarUmPull(
    override: Partial<PullAgendaDirecionadoDeps> | undefined,
    trailing: boolean
  ): Promise<Agendamento[] | null> {
    pullsIniciados += 1
    const deps = resolverDeps(override)
    const resultado = await aplicarPullAgendaDirecionado({
      officeId,
      pullId: novoPullId(),
      trailing,
      carregarLocal: () => deps.carregarLocal(officeId),
      carregarRemoto: () => deps.carregarRemoto(officeId),
      salvarLocal: (agendamentos) =>
        deps.salvarLocal(officeId, { ...deps.carregarLocal(officeId), agendamentos }),
      onUi: (agendamentos) => deps.onUi?.(officeId, agendamentos),
    })
    return resultado.agendamentos
  }

  async function executarInterno(
    override?: Partial<PullAgendaDirecionadoDeps>,
    opcoes?: { trailing?: boolean }
  ): Promise<Agendamento[] | null> {
    if (ciclo) {
      suja = true
      return ciclo
    }

    ciclo = (async () => {
      let trailing = Boolean(opcoes?.trailing)
      let ultimo: Agendamento[] | null = null
      do {
        if (cancelado) break
        try {
          ultimo = await rodarUmPull(override, trailing)
        } catch {
          ultimo = null
        }
        trailing = true
      } while (!cancelado && consumirSuja())
      return ultimo
    })()

    try {
      return await ciclo
    } finally {
      ciclo = null
      if (!cancelado && consumirSuja()) {
        void executarInterno(override, { trailing: true })
      }
    }
  }

  return {
    agendar(tabela, contexto) {
      return scheduler.agendar(tabela, {
        ...contexto,
        pullEmAndamento: ciclo !== null,
        marcarTrailing: () => {
          suja = true
        },
      })
    },
    executar: (deps, opcoes) => executarInterno(deps, opcoes),
    cancelar() {
      cancelado = true
      suja = false
      scheduler.cancelar()
    },
    estaPullEmAndamento: () => ciclo !== null,
    estaSuja: () => suja,
    pullsIniciados: () => pullsIniciados,
  }
}
