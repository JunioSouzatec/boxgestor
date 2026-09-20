import {
  logAgendaPush,
  resultadoExcecaoAgenda,
  type AgendaPushResult,
} from '@/services/agenda/agenda-push'
import { logAgendaOrigem } from '@/services/agenda/agenda-origem-log'
import { clonarAgendamentos } from '@/services/agenda/agenda-save-rebase'
import type { Agendamento } from '@/types'

export type OrigemPushAgenda = { trailing: boolean }

export type ExecutarPushAgendaSnapshot = (
  snapshot: Agendamento[],
  origem?: OrigemPushAgenda
) => Promise<AgendaPushResult>

interface FilaPushAgenda {
  rodando: boolean
  trailing: Agendamento[] | null
  trailingExecutar: ExecutarPushAgendaSnapshot | null
  trailingWaiters: Array<(result: AgendaPushResult) => void>
}

const filas = new Map<string, FilaPushAgenda>()

export function resetarFilaPushAgendaParaTeste(): void {
  filas.clear()
}

function obterFila(officeId: string): FilaPushAgenda {
  let fila = filas.get(officeId)
  if (!fila) {
    fila = {
      rodando: false,
      trailing: null,
      trailingExecutar: null,
      trailingWaiters: [],
    }
    filas.set(officeId, fila)
  }
  return fila
}

/**
 * Coalescência com trailing: push novo durante um em andamento NÃO reutiliza
 * o resultado do snapshot antigo. O último snapshot sempre roda depois.
 * Cada caller recebe só o resultado do push que corresponde ao snapshot dele.
 */
export async function enfileirarPushAgenda(
  officeId: string,
  snapshot: Agendamento[],
  executar: ExecutarPushAgendaSnapshot
): Promise<AgendaPushResult> {
  const fila = obterFila(officeId)
  const snapshotImutavel = clonarAgendamentos(snapshot)
  if (fila.rodando) {
    fila.trailing = clonarAgendamentos(snapshotImutavel)
    fila.trailingExecutar = executar
    logAgendaOrigem({
      etapa: 'trailing_snapshot',
      agendamentos: fila.trailing,
      source: 'trailing_pos_save',
      trailing: true,
    })
    logAgendaPush({
      officeId,
      etapa: 'trailing_agendado',
      quantidade: snapshotImutavel.length,
    })
    return new Promise((resolve) => {
      fila.trailingWaiters.push(resolve)
    })
  }

  fila.rodando = true
  return bombearPushAgenda(officeId, snapshotImutavel, executar, false)
}

async function bombearPushAgenda(
  officeId: string,
  snapshot: Agendamento[],
  executar: ExecutarPushAgendaSnapshot,
  trailing: boolean
): Promise<AgendaPushResult> {
  const fila = obterFila(officeId)
  const bruto = await executar(snapshot, { trailing }).catch(() =>
    resultadoExcecaoAgenda()
  )
  const result: AgendaPushResult = { ...bruto, trailing }

  const trailingSnap = fila.trailing
  const trailingExecutar = fila.trailingExecutar ?? executar
  const waiters = fila.trailingWaiters
  fila.trailing = null
  fila.trailingExecutar = null
  fila.trailingWaiters = []

  if (trailingSnap) {
    logAgendaPush({
      officeId,
      etapa: 'trailing_executando',
      quantidade: trailingSnap.length,
    })
    void bombearPushAgenda(
      officeId,
      clonarAgendamentos(trailingSnap),
      trailingExecutar,
      true
    ).then(
      (okTrailing) => {
        for (const waiter of waiters) waiter(okTrailing)
      },
      () => {
        const falha = resultadoExcecaoAgenda()
        for (const waiter of waiters) waiter({ ...falha, trailing: true })
      }
    )
  } else {
    fila.rodando = false
  }

  return result
}
