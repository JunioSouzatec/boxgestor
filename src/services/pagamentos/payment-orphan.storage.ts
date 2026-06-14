const STORAGE_KEY = 'craft_orfao_auditoria_v1'

export interface RegistroAuditoriaOrfao {
  id: string
  lancamento_id: string
  valor: number
  descricao: string
  motivo: string
  acao: 'arquivado' | 'limpo'
  arquivado_em: string
  os_referencia?: string
}

interface AuditoriaStore {
  version: 1
  registros: RegistroAuditoriaOrfao[]
}

function loadStore(): AuditoriaStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AuditoriaStore
  } catch {
    /* seed */
  }
  return { version: 1, registros: [] }
}

function saveStore(store: AuditoriaStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function registrarAuditoriaOrfao(registro: Omit<RegistroAuditoriaOrfao, 'id'>): void {
  const store = loadStore()
  store.registros.unshift({
    ...registro,
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  })
  if (store.registros.length > 200) {
    store.registros = store.registros.slice(0, 200)
  }
  saveStore(store)
}

export function listarAuditoriaOrfaos(limite = 50): RegistroAuditoriaOrfao[] {
  return loadStore().registros.slice(0, limite)
}
