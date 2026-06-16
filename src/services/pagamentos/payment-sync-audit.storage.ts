const STORAGE_KEY = 'craft_sync_pendencia_auditoria_v1'

export type AcaoAuditoriaSyncPendencia =
  | 'criada'
  | 'limpeza_automatica'
  | 'limpeza_manual'
  | 'reconciliacao_supabase'
  | 'falha_sync'

export interface RegistroAuditoriaSyncPendencia {
  id: string
  lancamento_id: string
  acao: AcaoAuditoriaSyncPendencia
  motivo: string
  payment_supabase_id?: string
  erro_tecnico?: string
  registrado_em: string
}

interface AuditoriaStore {
  version: 1
  registros: RegistroAuditoriaSyncPendencia[]
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

export function registrarAuditoriaSyncPendencia(
  registro: Omit<RegistroAuditoriaSyncPendencia, 'id' | 'registrado_em'> & {
    registrado_em?: string
  }
): void {
  const store = loadStore()
  store.registros.unshift({
    ...registro,
    id: `sync-aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    registrado_em: registro.registrado_em ?? new Date().toISOString(),
  })
  if (store.registros.length > 300) {
    store.registros = store.registros.slice(0, 300)
  }
  saveStore(store)
  console.info('[Admin BoxGestor] sync pendência', registro)
}

export function listarAuditoriaSyncPendencias(limite = 50): RegistroAuditoriaSyncPendencia[] {
  return loadStore().registros.slice(0, limite)
}
