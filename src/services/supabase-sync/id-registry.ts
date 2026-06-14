const STORAGE_KEY = 'craft_id_map_v1'

interface IdMapStoreV1 {
  version: 1
  uuidParaLocal: Record<string, string>
}

interface IdMapStoreV2 {
  version: 2
  uuidParaLocal: Record<string, string>
  localParaUuid: Record<string, string>
}

type IdMapStore = IdMapStoreV1 | IdMapStoreV2

function loadStore(): IdMapStoreV2 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as IdMapStore
      if (parsed.version === 2) return parsed as IdMapStoreV2
      if (parsed.version === 1) {
        const localParaUuid: Record<string, string> = {}
        for (const [uuid, local] of Object.entries(parsed.uuidParaLocal)) {
          localParaUuid[local] = uuid
        }
        return { version: 2, uuidParaLocal: parsed.uuidParaLocal, localParaUuid }
      }
    }
  } catch {
    /* seed */
  }
  return { version: 2, uuidParaLocal: {}, localParaUuid: {} }
}

function saveStore(store: IdMapStoreV2): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

/** Registra par local ↔ UUID Supabase (OS, cliente, pagamento, etc.) */
export function registrarMapeamentoId(localId: string, uuid: string): void {
  const store = loadStore()
  store.uuidParaLocal[uuid] = localId
  store.localParaUuid[localId.trim()] = uuid.trim()
  saveStore(store)
}

export function registrarMapeamentos(map: Record<string, string>): void {
  const store = loadStore()
  for (const [uuid, local] of Object.entries(map)) {
    store.uuidParaLocal[uuid] = local
    store.localParaUuid[local.trim()] = uuid.trim()
  }
  saveStore(store)
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
