import {
  aplicarDedupClientesNoDatabase,
  normalizarCpfCliente,
  normalizarNomeCliente,
  normalizarTelefoneCliente,
} from '@/services/clientes/deduplicate-clientes.service'
import type { DadosFase1Remotos } from '@/services/supabase-sync/reverse-mappers'
import type { Cliente } from '@/types/cliente'
import type { CraftDatabase } from '@/types/database'
import type { Moto } from '@/types/moto'

/** Mesma placa que a moto remota → id remoto. Sem prefixo. */
export function gerarMotorcycleIdRemap(remoto: Moto[], local: Moto[]): Map<string, string> {
  const remap = new Map<string, string>()
  const remotoPorId = new Set(remoto.map((m) => m.id))
  const remotoPorPlaca = new Map<string, Moto>()
  for (const m of remoto) {
    remap.set(m.id, m.id)
    const placa = m.placa?.trim().toUpperCase()
    if (placa && !remotoPorPlaca.has(placa)) remotoPorPlaca.set(placa, m)
  }
  for (const m of local) {
    if (remotoPorId.has(m.id)) {
      remap.set(m.id, m.id)
      continue
    }
    const placa = m.placa?.trim().toUpperCase()
    const remota = placa ? remotoPorPlaca.get(placa) : undefined
    remap.set(m.id, remota ? remota.id : m.id)
  }
  return remap
}

export function resolverIdCanonico(id: string, remap: Map<string, string>): string {
  const visto = new Set<string>()
  let atual = id.trim()
  while (remap.has(atual) && remap.get(atual) !== atual && !visto.has(atual)) {
    visto.add(atual)
    atual = remap.get(atual)!.trim()
  }
  return atual
}

/** Mesma pessoa que o customer remoto: CPF, tel+nome, ou só telefone. Sem prefixo. */
export function encontrarClienteLocalCorrespondente(
  canonico: Cliente,
  locais: Cliente[]
): Cliente | undefined {
  const cpfRow = normalizarCpfCliente(canonico.cpf)
  if (cpfRow.length >= 11) {
    const porCpf = locais.find(
      (c) => c.id !== canonico.id && normalizarCpfCliente(c.cpf) === cpfRow
    )
    if (porCpf) return porCpf
  }

  const telRow = normalizarTelefoneCliente(canonico.telefone)
  const nomeRow = normalizarNomeCliente(canonico.nome)
  if (telRow.length < 8) return undefined

  const porTelNome = locais.find(
    (c) =>
      c.id !== canonico.id &&
      normalizarTelefoneCliente(c.telefone) === telRow &&
      normalizarNomeCliente(c.nome) === nomeRow
  )
  if (porTelNome) return porTelNome

  return locais.find(
    (c) => c.id !== canonico.id && normalizarTelefoneCliente(c.telefone) === telRow
  )
}

export function gerarCustomerIdRemap(input: {
  remoto: Cliente[]
  local: Cliente[]
  motorcycleIdRemap?: Map<string, string>
  motosRemotas?: Moto[]
  motosLocais?: Moto[]
  mapaDedup?: Map<string, string>
}): Map<string, string> {
  const remap = new Map<string, string>()
  const idsRemotos = new Set(input.remoto.map((c) => c.id))

  for (const remoto of input.remoto) {
    remap.set(remoto.id, remoto.id)
    const match = encontrarClienteLocalCorrespondente(remoto, input.local)
    if (match) remap.set(match.id, remoto.id)
  }

  if (input.motorcycleIdRemap && input.motosLocais && input.motosRemotas) {
    const remotoPorId = new Map(input.motosRemotas.map((m) => [m.id, m]))
    const localPorId = new Map(input.motosLocais.map((m) => [m.id, m]))
    for (const [motoAntiga, motoCanonica] of input.motorcycleIdRemap) {
      if (motoAntiga === motoCanonica) continue
      const localMoto = localPorId.get(motoAntiga)
      const remotoMoto = remotoPorId.get(motoCanonica)
      if (
        localMoto?.cliente_id &&
        remotoMoto?.cliente_id &&
        localMoto.cliente_id !== remotoMoto.cliente_id
      ) {
        remap.set(localMoto.cliente_id, remotoMoto.cliente_id)
      }
    }
  }

  if (input.mapaDedup) {
    for (const [antigo, canonico] of input.mapaDedup) {
      if (idsRemotos.has(antigo) && !idsRemotos.has(canonico)) {
        remap.set(canonico, antigo)
        continue
      }
      const dest = resolverIdCanonico(canonico, remap)
      remap.set(antigo, idsRemotos.has(dest) ? dest : resolverIdCanonico(antigo, remap))
    }
  }

  return remap
}

export function aplicarCanonicalizacaoRefs(
  db: CraftDatabase,
  customerIdRemap: Map<string, string>,
  motorcycleIdRemap: Map<string, string>
): CraftDatabase {
  const clienteId = (id: string) => resolverIdCanonico(id, customerIdRemap)
  const motoId = (id: string) => resolverIdCanonico(id, motorcycleIdRemap)

  return {
    ...db,
    clientes: db.clientes.filter((c) => clienteId(c.id) === c.id),
    motos: db.motos
      .filter((m) => motoId(m.id) === m.id)
      .map((m) => ({ ...m, cliente_id: clienteId(m.cliente_id) })),
    ordens_servico: db.ordens_servico.map((os) => ({
      ...os,
      cliente_id: clienteId(os.cliente_id),
      moto_id: motoId(os.moto_id),
    })),
    agendamentos: (db.agendamentos ?? []).map((ag) => ({
      ...ag,
      cliente_id: clienteId(ag.cliente_id),
      moto_id: motoId(ag.moto_id),
    })),
  }
}

export function canonicalizarFase1Snapshot(input: {
  local: CraftDatabase
  remoto: DadosFase1Remotos
  snapshotMesclado: CraftDatabase
}): {
  snapshot: CraftDatabase
  customerIdRemap: Map<string, string>
  motorcycleIdRemap: Map<string, string>
} {
  const motorcycleIdRemap = gerarMotorcycleIdRemap(input.remoto.motos, input.local.motos)
  const dedup = aplicarDedupClientesNoDatabase(input.snapshotMesclado)
  const customerIdRemap = gerarCustomerIdRemap({
    remoto: input.remoto.clientes,
    local: input.local.clientes,
    motorcycleIdRemap,
    motosRemotas: input.remoto.motos,
    motosLocais: input.local.motos,
    mapaDedup: dedup.mapaIdAntigoParaCanonico,
  })
  return {
    snapshot: aplicarCanonicalizacaoRefs(dedup.db, customerIdRemap, motorcycleIdRemap),
    customerIdRemap,
    motorcycleIdRemap,
  }
}
