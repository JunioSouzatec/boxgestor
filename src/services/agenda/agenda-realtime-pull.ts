import {
  criarCoordenadorPullAgenda,
  type CoordenadorPullAgenda,
  type PullAgendaDirecionadoDeps,
} from '@/services/agenda/agenda-realtime-coordenador'
import { DEBOUNCE_AGENDA_REALTIME_MS } from '@/services/agenda/agenda-realtime-scheduler'
import { carregarAgendamentosDoSupabase } from '@/services/agenda/supabase-agenda.persistence'
import { localCraftRepository } from '@/services/repository/local.repository'
import type { Agendamento } from '@/types'
import type { ResultadoAgendarPullAgenda } from '@/services/agenda/agenda-realtime-scheduler'

export { DEBOUNCE_AGENDA_REALTIME_MS }
export type { CoordenadorPullAgenda, PullAgendaDirecionadoDeps }
export { criarCoordenadorPullAgenda } from '@/services/agenda/agenda-realtime-coordenador'

export type HandlerPullAgendaUi = (agendamentos: Agendamento[]) => void

const handlersUi = new Map<string, HandlerPullAgendaUi>()
const coordenadores = new Map<string, CoordenadorPullAgenda>()

export function registrarHandlerPullAgenda(
  officeId: string,
  handler: HandlerPullAgendaUi
): void {
  handlersUi.set(officeId, handler)
}

export function limparHandlerPullAgenda(officeId: string): void {
  handlersUi.delete(officeId)
  coordenadores.get(officeId)?.cancelar()
  coordenadores.delete(officeId)
}

export function resetarEstadoPullAgendaParaTeste(): void {
  for (const coord of coordenadores.values()) coord.cancelar()
  coordenadores.clear()
  handlersUi.clear()
}

function obterCoordenador(officeId: string): CoordenadorPullAgenda {
  let coord = coordenadores.get(officeId)
  if (!coord) {
    coord = criarCoordenadorPullAgenda(officeId, {
      carregarLocal: (id) => localCraftRepository.carregar(id),
      carregarRemoto: (id) => carregarAgendamentosDoSupabase(id),
      salvarLocal: (id, db) => localCraftRepository.salvar(id, db),
      onUi: (id, ags) => handlersUi.get(id)?.(ags),
    })
    coordenadores.set(officeId, coord)
  }
  return coord
}

export async function executarPullAgendaDirecionado(
  officeId: string,
  deps?: Partial<PullAgendaDirecionadoDeps>
): Promise<Agendamento[] | null> {
  return obterCoordenador(officeId).executar(deps)
}

export function agendarPullAgendaRealtime(
  officeId: string,
  tabela: string,
  contexto?: { eventType?: string; appointmentId?: string }
): ResultadoAgendarPullAgenda {
  return obterCoordenador(officeId).agendar(tabela, contexto)
}
