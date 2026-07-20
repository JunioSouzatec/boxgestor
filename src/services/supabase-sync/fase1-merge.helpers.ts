import { entidadeFoiExcluida, resolverEntidadeMesclada } from '@/lib/entidade-ativa'
import { calcularProximoNumeroOs } from '@/services/os-numbering.service'
import { localCraftRepository } from '@/services/repository/local.repository'
import type { Cliente, Moto, OrdemServico } from '@/types'
import type { CraftDatabase } from '@/types/database'

function preferirEntidadeMaisCompleta<T extends { id: string; atualizado_em?: string; updated_at?: string; deleted_at?: string | null; ativo?: boolean }>(
  a: T,
  b: T
): T {
  return resolverEntidadeMesclada(a, b)
}

function tsEntidade(e: { atualizado_em?: string; updated_at?: string }): string {
  return e.updated_at ?? e.atualizado_em ?? ''
}

/**
 * Com prioridadeRemota: Supabase define existência.
 * Tombstone local NÃO esconde registro ativo remoto (bug multi-dispositivo).
 * Local só vence se ambos ativos e updated_at local for mais novo.
 */
function mesclarEntidadeFase1<T extends { id: string; atualizado_em?: string; updated_at?: string; deleted_at?: string | null; ativo?: boolean }>(
  remoto: T,
  local: T,
  prioridadeRemota: boolean
): T {
  if (!prioridadeRemota) {
    return preferirEntidadeMaisCompleta(remoto, local)
  }

  const remotoExcluido = entidadeFoiExcluida(remoto)
  const localExcluido = entidadeFoiExcluida(local)

  // Soft-delete remoto é fonte da verdade (outro dispositivo excluiu)
  if (remotoExcluido) return remoto
  // Remoto ativo: nunca esconder por tombstone/cache local antigo
  if (localExcluido) return remoto

  const tsR = tsEntidade(remoto)
  const tsL = tsEntidade(local)
  // Local mais novo (edição ainda não puxada / concurrent) vence metadados
  if (tsL && tsR && tsL > tsR) return local
  return remoto
}

export function unirClientesPreservandoLocal(
  remoto: Cliente[],
  local: Cliente[],
  opcoes?: { prioridadeRemota?: boolean }
): Cliente[] {
  const prioridadeRemota = opcoes?.prioridadeRemota ?? false
  const mapa = new Map<string, Cliente>()
  for (const c of remoto) mapa.set(c.id, c)
  for (const c of local) {
    const existente = mapa.get(c.id)
    mapa.set(c.id, existente ? mesclarEntidadeFase1(existente, c, prioridadeRemota) : c)
  }
  return [...mapa.values()]
}

export function unirMotosPreservandoLocal(
  remoto: Moto[],
  local: Moto[],
  opcoes?: { prioridadeRemota?: boolean }
): Moto[] {
  const prioridadeRemota = opcoes?.prioridadeRemota ?? false
  const mapa = new Map<string, Moto>()
  const placasRemotas = new Set(remoto.map((m) => m.placa?.trim().toUpperCase()).filter(Boolean))

  for (const m of remoto) mapa.set(m.id, m)
  for (const m of local) {
    if (mapa.has(m.id)) {
      mapa.set(m.id, mesclarEntidadeFase1(mapa.get(m.id)!, m, prioridadeRemota))
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
  local: OrdemServico[],
  opcoes?: { prioridadeRemota?: boolean }
): OrdemServico[] {
  const prioridadeRemota = opcoes?.prioridadeRemota ?? false
  const porId = new Map<string, OrdemServico>()

  for (const os of remoto) porId.set(os.id, os)

  for (const os of local) {
    if (porId.has(os.id)) {
      porId.set(os.id, mesclarEntidadeFase1(porId.get(os.id)!, os, prioridadeRemota))
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
