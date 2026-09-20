import { localIdParaUuid } from '@/lib/local-id-uuid'
import {
  idRegistryObservado,
  logRegistryGuard,
  logRegistryWrite,
} from '@/services/supabase-sync/registry-heal-log'

const STORAGE_KEY = 'craft_id_map_v1'

export type OrigemMapeamentoId = 'confirmado' | 'provisorio'

/** Prova de que o UUID é identidade remota, não fallback determinístico. */
export type ProvaMapeamentoId = 'remote_row' | 'remote_upsert' | 'deterministic_fallback'

const hashPorLocal = new Map<string, string>()

export async function lembrarHashDeterministico(localId: string): Promise<string> {
  const local = localId.trim()
  const cached = hashPorLocal.get(local)
  if (cached) return cached
  const hash = await localIdParaUuid(local)
  hashPorLocal.set(local, hash)
  return hash
}

export function hashDeterministicoEmCache(localId: string): string | undefined {
  return hashPorLocal.get(localId.trim())
}

interface IdMapStoreV1 {
  version: 1
  uuidParaLocal: Record<string, string>
}

interface IdMapStoreV2 {
  version: 2
  uuidParaLocal: Record<string, string>
  localParaUuid: Record<string, string>
}

interface IdMapStoreV3 {
  version: 3
  uuidParaLocal: Record<string, string>
  localParaUuid: Record<string, string>
  origemPorLocal: Record<string, OrigemMapeamentoId>
}

type IdMapStore = IdMapStoreV1 | IdMapStoreV2 | IdMapStoreV3

function loadStore(): IdMapStoreV3 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as IdMapStore
      if (parsed.version === 3) return parsed as IdMapStoreV3
      if (parsed.version === 2) {
        const v2 = parsed as IdMapStoreV2
        return {
          version: 3,
          uuidParaLocal: v2.uuidParaLocal,
          localParaUuid: v2.localParaUuid,
          origemPorLocal: {},
        }
      }
      if (parsed.version === 1) {
        const localParaUuid: Record<string, string> = {}
        for (const [uuid, local] of Object.entries(parsed.uuidParaLocal)) {
          localParaUuid[local] = uuid
        }
        return {
          version: 3,
          uuidParaLocal: parsed.uuidParaLocal,
          localParaUuid,
          origemPorLocal: {},
        }
      }
    }
  } catch {
    /* seed */
  }
  return { version: 3, uuidParaLocal: {}, localParaUuid: {}, origemPorLocal: {} }
}

function saveStore(store: IdMapStoreV3): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function gravarMapeamento(
  localId: string,
  uuid: string,
  origem: OrigemMapeamentoId,
  caller: string
): void {
  const store = loadStore()
  const local = localId.trim()
  const remoto = uuid.trim()
  if (!local || !remoto) return

  const uuidAnterior = store.localParaUuid[local]
  const origemAnterior = store.origemPorLocal[local]
  if (idRegistryObservado(local) || idRegistryObservado(remoto) || idRegistryObservado(uuidAnterior)) {
    logRegistryWrite({
      localId: local,
      valorAnterior: uuidAnterior ?? null,
      origemAnterior: origemAnterior ?? null,
      valorNovo: remoto,
      origemNova: origem,
      caller,
    })
  }
  if (uuidAnterior && uuidAnterior !== remoto && store.uuidParaLocal[uuidAnterior] === local) {
    delete store.uuidParaLocal[uuidAnterior]
  }
  const localAnterior = store.uuidParaLocal[remoto]
  if (localAnterior && localAnterior !== local && store.localParaUuid[localAnterior] === remoto) {
    delete store.localParaUuid[localAnterior]
    delete store.origemPorLocal[localAnterior]
  }

  store.uuidParaLocal[remoto] = local
  store.localParaUuid[local] = remoto
  store.origemPorLocal[local] = origem
  saveStore(store)
}

/**
 * Origem persistida. Sem metadata explícita: compatibilidade = confirmado,
 * até `normalizarOrigensLegadoRegistry` classificar hash determinístico como provisório.
 */
export function obterOrigemMapeamentoId(localId: string): OrigemMapeamentoId | undefined {
  const local = localId.trim()
  if (!local) return undefined
  const store = loadStore()
  if (!(local in store.localParaUuid)) return undefined
  return store.origemPorLocal[local] ?? 'confirmado'
}

/** True se o UUID gravado é o hash determinístico daquele localId — não prova remota. */
export async function mappingEhHashDeterministico(localId: string): Promise<boolean> {
  const local = localId.trim()
  const atual = obterUuidPorLocalId(local)
  if (!atual) return false
  return atual === (await lembrarHashDeterministico(local))
}

/**
 * Completa origem de mappings legado (v1/v2 ou v3 sem metadata).
 * Não apaga pares. Não rebaixa confirmado explícito — hash histórico
 * só troca para UUID remoto real com prova semântica no reverse mapper.
 * Leitura síncrona não dispara isto.
 */
export async function normalizarOrigensLegadoRegistry(): Promise<void> {
  const store = loadStore()
  let mudou = false
  for (const [localId, uuid] of Object.entries(store.localParaUuid)) {
    const local = localId.trim()
    const remoto = uuid.trim()
    if (!local || !remoto) continue
    if (store.origemPorLocal[local]) continue
    const hash = await lembrarHashDeterministico(local)
    store.origemPorLocal[local] = remoto === hash ? 'provisorio' : 'confirmado'
    mudou = true
  }
  if (mudou) saveStore(store)
}

function logGuardHashSobreConfirmado(
  local: string,
  atual: string,
  remoto: string,
  caller: string,
  prova: ProvaMapeamentoId | 'unproven'
): void {
  logRegistryGuard({
    localId: local,
    valorAtual: atual,
    tentativa: remoto,
    caller,
    motivo: 'deterministic_hash_nao_sobrescreve_confirmado',
    prova,
  })
}

/**
 * Hash determinístico sozinho não é prova remota.
 * `remote_row` / `remote_upsert` podem confirmar hash legítimo (row.id = H)
 * e curar hash histórico → UUID real. Não podem trocar UUID real confirmado por H.
 */
function bloquearHashSobreConfirmado(
  local: string,
  remoto: string,
  caller: string,
  prova: ProvaMapeamentoId | 'unproven'
): boolean {
  const atual = obterUuidPorLocalId(local)
  if (!atual || atual === remoto) return false
  if (obterOrigemMapeamentoId(local) !== 'confirmado') return false

  const hash = hashPorLocal.get(local)
  const novoEhHash = hash === remoto
  const atualEhHash = hash !== undefined && hash === atual

  if (prova === 'deterministic_fallback') {
    logGuardHashSobreConfirmado(local, atual, remoto, caller, prova)
    return true
  }

  if (prova === 'unproven' && novoEhHash) {
    logGuardHashSobreConfirmado(local, atual, remoto, caller, prova)
    return true
  }

  if ((prova === 'remote_row' || prova === 'remote_upsert') && novoEhHash && !atualEhHash) {
    logGuardHashSobreConfirmado(local, atual, remoto, caller, prova)
    return true
  }

  return false
}

/** UUID remoto confirmado (row do Supabase). Substitui hash histórico, mesmo se já 'confirmado'. */
export function registrarMapeamentoIdConfirmado(
  localId: string,
  uuid: string,
  caller = 'registrarMapeamentoIdConfirmado',
  prova: ProvaMapeamentoId = 'remote_row'
): void {
  const local = localId.trim()
  const remoto = uuid.trim()
  if (!local || !remoto) return
  if (bloquearHashSobreConfirmado(local, remoto, caller, prova)) return
  gravarMapeamento(local, remoto, 'confirmado', caller)
}

/**
 * UUID determinístico provisório (primeira criação local).
 * Não substitui mapping confirmado para o mesmo localId.
 */
export function registrarMapeamentoIdProvisorio(
  localId: string,
  uuid: string,
  caller = 'registrarMapeamentoIdProvisorio'
): void {
  const local = localId.trim()
  const remoto = uuid.trim()
  if (!local || !remoto) return
  const atual = obterUuidPorLocalId(local)
  if (atual && atual !== remoto && obterOrigemMapeamentoId(local) === 'confirmado') {
    logGuardHashSobreConfirmado(local, atual, remoto, caller, 'deterministic_fallback')
    if (idRegistryObservado(local) || idRegistryObservado(remoto) || idRegistryObservado(atual)) {
      logRegistryWrite({
        localId: local,
        valorAnterior: atual,
        origemAnterior: 'confirmado',
        valorNovo: remoto,
        origemNova: 'provisorio',
        caller,
        skip: true,
        motivoSkip: 'origem_confirmado_bloqueia_provisorio',
      })
    }
    return
  }
  gravarMapeamento(local, remoto, 'provisorio', caller)
}

/** Compat: sem prova remota. Hash determinístico não sobrescreve UUID real confirmado. */
export function registrarMapeamentoId(
  localId: string,
  uuid: string,
  caller = 'registrarMapeamentoId'
): void {
  const local = localId.trim()
  const remoto = uuid.trim()
  if (!local || !remoto) return
  if (bloquearHashSobreConfirmado(local, remoto, caller, 'unproven')) return
  gravarMapeamento(local, remoto, 'confirmado', caller)
}

export function registrarMapeamentos(map: Record<string, string>): void {
  for (const [uuid, local] of Object.entries(map)) {
    registrarMapeamentoId(local, uuid, 'registrarMapeamentos')
  }
}

export function obterLocalIdPorUuid(uuid: string): string | undefined {
  return loadStore().uuidParaLocal[uuid]
}

export function obterUuidPorLocalId(localId: string): string | undefined {
  return loadStore().localParaUuid[localId.trim()]
}

export function listarIdsLocaisCandidatos(extra: string[] = []): string[] {
  const store = loadStore()
  return [...new Set([...Object.keys(store.localParaUuid), ...extra])]
}

/** Limpa mapeamentos local ↔ UUID (reset de ambiente de teste). */
export function limparRegistroIds(): void {
  hashPorLocal.clear()
  saveStore({ version: 3, uuidParaLocal: {}, localParaUuid: {}, origemPorLocal: {} })
}
