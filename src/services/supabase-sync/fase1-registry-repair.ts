import { isUuidFormato } from '@/lib/local-id-uuid'
import { deduplicarClientes } from '@/services/clientes/deduplicate-clientes.service'
import {
  executarEmLoteRegistry,
  executarEmLoteRegistryAsync,
  normalizarOrigensLegadoRegistry,
  obterLocalIdPorUuid,
  obterUuidPorLocalId,
  registrarMapeamentoIdConfirmado,
} from '@/services/supabase-sync/id-registry'
import {
  mapearCustomerReverso,
  mapearMotorcycleReverso,
  type CustomerRow,
  type MotorcycleRow,
} from '@/services/supabase-sync/reverse-mappers'
import type { Cliente } from '@/types/cliente'
import type { Moto } from '@/types/moto'

/**
 * Depois do pull, a row remota é a fonte da verdade.
 * Nunca grava hash determinístico no lugar de um UUID que acabou de vir do Supabase.
 */
export function registrarFksRemotasFase1(input: {
  officeLocalId: string
  officeUuid: string
  customerRemotoIds: string[]
  motorcycleRemotoIds: string[]
  serviceOrderPairs?: Array<{ localId: string; remotoId: string }>
  mapaDedupCliente?: Map<string, string>
}): void {
  executarEmLoteRegistry(() => {
    registrarMapeamentoIdConfirmado(input.officeLocalId, input.officeUuid, 'registrarFksRemotasFase1')
    repararRegistryAposDedupClientes(input.mapaDedupCliente)

    for (const remotoId of input.customerRemotoIds) {
      const local = obterLocalIdPorUuid(remotoId)
      if (local) registrarMapeamentoIdConfirmado(local, remotoId, 'registrarFksRemotasFase1')
    }
    for (const remotoId of input.motorcycleRemotoIds) {
      const local = obterLocalIdPorUuid(remotoId)
      if (local) registrarMapeamentoIdConfirmado(local, remotoId, 'registrarFksRemotasFase1')
    }
    for (const os of input.serviceOrderPairs ?? []) {
      registrarMapeamentoIdConfirmado(os.localId, os.remotoId, 'registrarFksRemotasFase1')
    }
  })
}

/** Sobrevivente herda UUID do canônico; só cai no antigo se o canônico ainda não tiver par. */
export function repararRegistryAposDedupClientes(
  mapaIdAntigoParaCanonico?: Map<string, string>
): void {
  if (!mapaIdAntigoParaCanonico) return
  executarEmLoteRegistry(() => {
    for (const [antigo, canonico] of mapaIdAntigoParaCanonico) {
      const remoto = obterUuidPorLocalId(canonico) ?? obterUuidPorLocalId(antigo)
      if (remoto) registrarMapeamentoIdConfirmado(canonico, remoto, 'repararRegistryAposDedupClientes')
    }
  })
}

/** Depois da canonicalização: só o id canônico ↔ UUID remoto. Mantém o registry 1:1. */
export function registrarIdsCanonicosAposCanonicalizacao(input: {
  remotoClientes: Array<{ id: string }>
  remotoMotos: Array<{ id: string }>
  customerIdRemap: Map<string, string>
  motorcycleIdRemap: Map<string, string>
}): void {
  executarEmLoteRegistry(() => {
    for (const row of input.remotoClientes) {
      registrarParCanonico(row.id, input.customerIdRemap)
    }
    for (const row of input.remotoMotos) {
      registrarParCanonico(row.id, input.motorcycleIdRemap)
    }
  })
}

function registrarParCanonico(rowId: string, remap: Map<string, string>): void {
  const escolhido = obterLocalIdPorUuid(rowId) ?? rowId
  const canonico = resolverCanonicoLocal(escolhido, remap)
  const remoto =
    obterUuidPorLocalId(escolhido) ??
    obterUuidPorLocalId(canonico) ??
    (isUuidFormato(rowId) ? rowId : undefined)
  if (remoto && isUuidFormato(remoto)) {
    registrarMapeamentoIdConfirmado(canonico, remoto, 'registrarIdsCanonicosAposCanonicalizacao')
  }
}

function resolverCanonicoLocal(id: string, remap: Map<string, string>): string {
  const visto = new Set<string>()
  let atual = id.trim()
  while (remap.has(atual) && remap.get(atual) !== atual && !visto.has(atual)) {
    visto.add(atual)
    atual = remap.get(atual)!.trim()
  }
  return atual
}

/** Pull Fase 1 só de registry (sem HTTP). Usado em teste e por carregarFase1. */
export async function aplicarPullFase1Registry(input: {
  officeLocalId: string
  officeUuid: string
  customers: CustomerRow[]
  motorcycles: MotorcycleRow[]
  candidatosCliente?: string[]
  candidatosMoto?: string[]
  clientesReferencia?: Cliente[]
  motosReferencia?: Moto[]
}): Promise<{ clientes: Cliente[]; motos: Moto[] }> {
  return executarEmLoteRegistryAsync(async () => {
    await normalizarOrigensLegadoRegistry()
    const clientes = await Promise.all(
      input.customers.map((row) =>
        mapearCustomerReverso(
          row,
          input.officeLocalId,
          input.candidatosCliente ?? [],
          input.clientesReferencia ?? []
        )
      )
    )
    const mapaCliente = new Map<string, string>()
    for (const row of input.customers) {
      const local = obterLocalIdPorUuid(row.id)
      if (local) mapaCliente.set(row.id, local)
    }
    const motos = await Promise.all(
      input.motorcycles.map((row) =>
        mapearMotorcycleReverso(
          row,
          input.officeLocalId,
          input.candidatosMoto ?? [],
          mapaCliente,
          input.motosReferencia ?? []
        )
      )
    )
    const { clientes: clientesDedup, mapaIdAntigoParaCanonico } = deduplicarClientes(
      clientes,
      motos,
      []
    )
    registrarFksRemotasFase1({
      officeLocalId: input.officeLocalId,
      officeUuid: input.officeUuid,
      customerRemotoIds: input.customers.map((row) => row.id),
      motorcycleRemotoIds: input.motorcycles.map((row) => row.id),
      mapaDedupCliente: mapaIdAntigoParaCanonico,
    })
    return { clientes: clientesDedup, motos }
  })
}
