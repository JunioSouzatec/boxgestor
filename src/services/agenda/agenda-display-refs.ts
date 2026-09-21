import { obterLocalIdPorUuid } from '@/services/supabase-sync/id-registry'
import {
  guestNameValido,
  guestVehicleValido,
  type Agendamento,
} from '@/types/agendamento'

const FALLBACK = '—'

/**
 * Resolve referência de appointment (alias local ou UUID remoto) para entidade na lista local.
 * Somente leitura — não altera registry nem dados persistidos.
 */
export function resolverEntidadeLocalPorRef<T extends { id: string }>(
  refId: string,
  lista: readonly T[]
): T | undefined {
  const id = refId.trim()
  if (!id) return undefined

  const direto = lista.find((e) => e.id === id)
  if (direto) return direto

  const localId = obterLocalIdPorUuid(id)
  if (!localId || localId === id) return undefined

  return lista.find((e) => e.id === localId)
}

export function rotuloClienteAgenda(
  clienteId: string | null | undefined,
  clientes: readonly { id: string; nome: string }[],
  ag?: Pick<Agendamento, 'guest_name'> | null
): string {
  const guest = ag ? guestNameValido(ag) : null
  if (guest) return guest
  if (!clienteId?.trim()) return FALLBACK
  return resolverEntidadeLocalPorRef(clienteId, clientes)?.nome ?? FALLBACK
}

/** Mesmo resolver para moto e carro (vehicle/motorcycle). */
export function rotuloVeiculoAgenda(
  veiculoId: string | null | undefined,
  veiculos: readonly { id: string; marca: string; modelo: string; placa: string }[],
  ag?: Pick<Agendamento, 'guest_vehicle'> | null
): string {
  const guest = ag ? guestVehicleValido(ag) : null
  if (guest) return guest
  if (!veiculoId?.trim()) return FALLBACK
  const m = resolverEntidadeLocalPorRef(veiculoId, veiculos)
  return m ? `${m.marca} ${m.modelo} (${m.placa})` : FALLBACK
}
