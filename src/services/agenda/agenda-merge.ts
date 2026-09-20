import { entidadeFoiExcluida } from '@/lib/entidade-ativa'
import { timestampAgendamento } from '@/services/agenda/agenda-mappers'
import type { Agendamento } from '@/types'

/**
 * Merge de Agenda por MESMO id (sem deduplicação semântica).
 *
 * Limitação desta fase: edição simultânea em dois dispositivos resolve por
 * `updated_at` mais recente (LWW). Não há revision/optimistic locking.
 * Tombstone (deleted_at) vence cópia ativa do mesmo id — não ressuscita.
 */
export function mesclarAgendamentos(
  local: Agendamento[],
  remoto: Agendamento[]
): Agendamento[] {
  const localPorId = new Map(local.map((a) => [a.id, a]))
  const remotoPorId = new Map(remoto.map((a) => [a.id, a]))
  const ids = new Set([...localPorId.keys(), ...remotoPorId.keys()])
  const resultado: Agendamento[] = []

  for (const id of ids) {
    const l = localPorId.get(id)
    const r = remotoPorId.get(id)

    if (!l && r) {
      resultado.push(r)
      continue
    }
    if (l && !r) {
      resultado.push(l)
      continue
    }
    if (!l || !r) continue

    const lDel = entidadeFoiExcluida(l)
    const rDel = entidadeFoiExcluida(r)

    if (rDel && !lDel) {
      resultado.push(r)
      continue
    }
    if (lDel && !rDel) {
      resultado.push(l)
      continue
    }
    if (lDel && rDel) {
      resultado.push(timestampAgendamento(r) >= timestampAgendamento(l) ? r : l)
      continue
    }

    const vencedor = timestampAgendamento(r) >= timestampAgendamento(l) ? r : l
    resultado.push(vencedor)
  }

  return resultado
}
