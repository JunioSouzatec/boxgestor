import type { HistoricoContato } from '@/types/comunicacao'

export const COMUNICACAO_STORAGE_KEY = 'craft_comunicacao_v1'

interface ComunicacaoStore {
  version: 1
  historico: Record<string, HistoricoContato[]>
}

export function loadComunicacaoStore(): ComunicacaoStore {
  try {
    const raw = localStorage.getItem(COMUNICACAO_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ComunicacaoStore
  } catch {
    /* seed */
  }
  return { version: 1, historico: {} }
}

export function saveComunicacaoStore(store: ComunicacaoStore): void {
  localStorage.setItem(COMUNICACAO_STORAGE_KEY, JSON.stringify(store))
}

export function listarHistoricoLocal(officeId: string): HistoricoContato[] {
  const store = loadComunicacaoStore()
  return (store.historico[officeId] ?? []).sort((a, b) => b.data.localeCompare(a.data))
}

export function salvarHistoricoOfficeLocal(officeId: string, itens: HistoricoContato[]): void {
  const store = loadComunicacaoStore()
  store.historico[officeId] = [...itens].sort((a, b) => b.data.localeCompare(a.data))
  saveComunicacaoStore(store)
}

export function adicionarHistoricoLocal(officeId: string, registro: HistoricoContato): void {
  const store = loadComunicacaoStore()
  if (!store.historico[officeId]) store.historico[officeId] = []
  store.historico[officeId].unshift(registro)
  saveComunicacaoStore(store)
}

/** Remove histórico de mensagens da oficina (reset de ambiente de teste). */
export function limparHistoricoComunicacaoPorOffice(officeId: string): void {
  const store = loadComunicacaoStore()
  delete store.historico[officeId]
  saveComunicacaoStore(store)
}

export function mesclarHistoricoContatos(
  local: HistoricoContato[],
  remoto: HistoricoContato[]
): HistoricoContato[] {
  const porId = new Map<string, HistoricoContato>()
  for (const item of remoto) porId.set(item.id, item)
  for (const item of local) {
    if (!porId.has(item.id)) porId.set(item.id, item)
  }
  return [...porId.values()].sort((a, b) => b.data.localeCompare(a.data))
}
