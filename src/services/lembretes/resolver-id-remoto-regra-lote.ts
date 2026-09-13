import {
  filtrarRegrasParaNaoRessuscitar,
  regraLembreteFoiExcluida,
  type TombstoneRemotoRegra,
} from './regra-lembrete-identidade'
import type { RegraLembrete } from '../../types/lembrete'

/** Resolução de PK remoto por local_id para persist direcionado e sync completo. */

export interface ResolucaoIdRemotoRegraLote {
  remoteIds: string[]
  nova: boolean
  anomalo: boolean
}

export function agruparLinhasRemotasPorLocalId(
  linhas: readonly TombstoneRemotoRegra[]
): Map<string, TombstoneRemotoRegra[]> {
  const mapa = new Map<string, TombstoneRemotoRegra[]>()
  for (const linha of linhas) {
    const localId = linha.local_id?.trim()
    if (!localId) continue
    const grupo = mapa.get(localId) ?? []
    grupo.push(linha)
    mapa.set(localId, grupo)
  }
  return mapa
}

/**
 * Reusa o PK remoto já existente para o local_id.
 * Só gera UUID determinístico quando ainda não há linha.
 * Múltiplas linhas com o mesmo local_id: todas as PKs, nenhuma nova.
 */
export function resolverIdsRemotosRegraLote(
  remotas: readonly TombstoneRemotoRegra[],
  uuidDeterministico: string
): ResolucaoIdRemotoRegraLote {
  if (remotas.length === 0) {
    return { remoteIds: [uuidDeterministico], nova: true, anomalo: false }
  }
  const remoteIds = [...new Set(remotas.map((linha) => linha.id).filter(Boolean))]
  return {
    remoteIds,
    nova: false,
    anomalo: remoteIds.length > 1,
  }
}

export function registrarAnomaliaLocalIdDuplicadoRemoto(
  localId: string,
  quantidade: number
): void {
  console.warn(
    `[lembretes] local_id com ${quantidade} linhas remotas (legado/anômalo); tombstone/update sem criar sombra. local_id=${localId}`
  )
}

export function deveAplicarTombstoneEmTodasRemotas(
  regra: Pick<RegraLembrete, 'deleted_at'>,
  remotas: readonly TombstoneRemotoRegra[]
): boolean {
  return regraLembreteFoiExcluida(regra) && remotas.length > 1
}

/** Alias: mesma resolução para persist direcionado e sync completo. */
export const resolverIdsRemotosRegra = resolverIdsRemotosRegraLote

export function selecionarRegrasSegurasParaPersistir(
  regras: readonly RegraLembrete[],
  remotosPorLocalId: ReadonlyMap<string, readonly TombstoneRemotoRegra[]>
): RegraLembrete[] {
  const seguras: RegraLembrete[] = []
  for (const regra of regras) {
    const remotas = remotosPorLocalId.get(regra.id) ?? []
    if (
      !filtrarRegrasParaNaoRessuscitar(
        [regra],
        remotas.map((row) => ({ ...row, local_id: regra.id }))
      ).length
    ) {
      continue
    }
    seguras.push(regra)
  }
  return seguras
}

/**
 * Monta o upsert com o PK remoto real.
 * Não usa o UUID do mapper quando a linha já existe.
 */
export async function montarLinhasRegraComIdsRemotosResolvidos(
  regras: readonly RegraLembrete[],
  remotosPorLocalId: ReadonlyMap<string, readonly TombstoneRemotoRegra[]>,
  mapear: (regra: RegraLembrete) => Promise<Record<string, unknown>>,
  uuidDeterministicoDe: (localId: string) => Promise<string>
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  const idsJaMontados = new Set<string>()
  for (const regra of regras) {
    const remotas = remotosPorLocalId.get(regra.id) ?? []
    const uuidDeterministico = await uuidDeterministicoDe(regra.id)
    const resolucao = resolverIdsRemotosRegra(remotas, uuidDeterministico)
    if (resolucao.anomalo) {
      registrarAnomaliaLocalIdDuplicadoRemoto(regra.id, resolucao.remoteIds.length)
    }
    const mapeada = await mapear(regra)
    for (const remoteId of resolucao.remoteIds) {
      if (idsJaMontados.has(remoteId)) continue
      idsJaMontados.add(remoteId)
      rows.push({ ...mapeada, id: remoteId })
    }
  }
  return rows
}
