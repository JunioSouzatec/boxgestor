import { calcularProximoNumeroOs } from '@/services/os-numbering.service'
import { localCraftRepository } from '@/services/repository/local.repository'
import type { Cliente, Moto, OrdemServico } from '@/types'
import type { CraftDatabase } from '@/types/database'

function preferirEntidadeMaisCompleta<T extends { id: string; atualizado_em?: string }>(
  a: T,
  b: T
): T {
  const ua = a.atualizado_em ?? ''
  const ub = b.atualizado_em ?? ''
  if (ua !== ub) return ub > ua ? b : a
  return a
}

export function unirClientesPreservandoLocal(
  remoto: Cliente[],
  local: Cliente[]
): Cliente[] {
  const mapa = new Map<string, Cliente>()
  for (const c of remoto) mapa.set(c.id, c)
  for (const c of local) {
    const existente = mapa.get(c.id)
    mapa.set(c.id, existente ? preferirEntidadeMaisCompleta(existente, c) : c)
  }
  return [...mapa.values()]
}

export function unirMotosPreservandoLocal(remoto: Moto[], local: Moto[]): Moto[] {
  const mapa = new Map<string, Moto>()
  const placasRemotas = new Set(remoto.map((m) => m.placa?.trim().toUpperCase()).filter(Boolean))

  for (const m of remoto) mapa.set(m.id, m)
  for (const m of local) {
    if (mapa.has(m.id)) {
      mapa.set(m.id, preferirEntidadeMaisCompleta(mapa.get(m.id)!, m))
      continue
    }
    const placa = m.placa?.trim().toUpperCase()
    if (placa && placasRemotas.has(placa)) continue
    mapa.set(m.id, m)
  }
  return [...mapa.values()]
}

/** Preserva OS locais ainda não enviadas ao Supabase — sempre por ID, nunca descarta por número. */
export function unirOrdensServicoPreservandoLocal(
  remoto: OrdemServico[],
  local: OrdemServico[]
): OrdemServico[] {
  const porId = new Map<string, OrdemServico>()

  for (const os of remoto) porId.set(os.id, os)

  for (const os of local) {
    if (porId.has(os.id)) {
      porId.set(os.id, preferirEntidadeMaisCompleta(porId.get(os.id)!, os))
      continue
    }
    porId.set(os.id, os)
  }

  return [...porId.values()].sort((a, b) => b.numero - a.numero)
}

/** Aplica alterações sem perder entidades da referência (ex.: OS só local). */
export function mesclarDatabasePreservandoEntidades(
  referencia: CraftDatabase,
  alterado: Partial<CraftDatabase>
): CraftDatabase {
  return {
    ...referencia,
    ...alterado,
    clientes: alterado.clientes
      ? unirClientesPreservandoLocal(alterado.clientes, referencia.clientes)
      : referencia.clientes,
    motos: alterado.motos
      ? unirMotosPreservandoLocal(alterado.motos, referencia.motos)
      : referencia.motos,
    ordens_servico: alterado.ordens_servico
      ? unirOrdensServicoPreservandoLocal(alterado.ordens_servico, referencia.ordens_servico)
      : referencia.ordens_servico,
    lancamentos: alterado.lancamentos ?? referencia.lancamentos,
  }
}

export function carregarBaseSeguraOffice(
  officeId: string,
  dadosContexto: CraftDatabase
): CraftDatabase {
  const local = localCraftRepository.carregar(officeId)
  return {
    ...dadosContexto,
    clientes: unirClientesPreservandoLocal(dadosContexto.clientes, local.clientes),
    motos: unirMotosPreservandoLocal(dadosContexto.motos, local.motos),
    ordens_servico: unirOrdensServicoPreservandoLocal(
      dadosContexto.ordens_servico,
      local.ordens_servico
    ),
    proximo_numero_os: calcularProximoNumeroOs({
      ordens_servico: unirOrdensServicoPreservandoLocal(
        dadosContexto.ordens_servico,
        local.ordens_servico
      ),
      proximo_numero_os: Math.max(dadosContexto.proximo_numero_os, local.proximo_numero_os),
    }),
  }
}
