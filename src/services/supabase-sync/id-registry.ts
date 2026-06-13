const STORAGE_KEY = 'craft_id_map_v1'

interface IdMapStore {
  version: 1
  /** uuid Supabase → id local do app */
  uuidParaLocal: Record<string, string>
}

function loadStore(): IdMapStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as IdMapStore
  } catch {
    /* seed */
  }
  return { version: 1, uuidParaLocal: {} }
}

function saveStore(store: IdMapStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function registrarMapeamentoId(localId: string, uuid: string): void {
  const store = loadStore()
  store.uuidParaLocal[uuid] = localId
  saveStore(store)
}

export function registrarMapeamentos(map: Record<string, string>): void {
  const store = loadStore()
  Object.assign(store.uuidParaLocal, map)
  saveStore(store)
}

export function obterLocalIdPorUuid(uuid: string): string | undefined {
  return loadStore().uuidParaLocal[uuid]
}

export function listarIdsLocaisCandidatos(extra: string[] = []): string[] {
  const store = loadStore()
  return [...new Set([...Object.values(store.uuidParaLocal), ...extra])]
}
