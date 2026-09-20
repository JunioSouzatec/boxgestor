import { obterLocalIdPorUuid } from '@/services/supabase-sync/id-registry'

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
  clienteId: string,
  clientes: readonly { id: string; nome: string }[]
): string {
  return resolverEntidadeLocalPorRef(clienteId, clientes)?.nome ?? FALLBACK
}

/** Mesmo resolver para moto e carro (vehicle/motorcycle). */
export function rotuloVeiculoAgenda(
  veiculoId: string,
  veiculos: readonly { id: string; marca: string; modelo: string; placa: string }[]
): string {
  const m = resolverEntidadeLocalPorRef(veiculoId, veiculos)
  return m ? `${m.marca} ${m.modelo} (${m.placa})` : FALLBACK
}
