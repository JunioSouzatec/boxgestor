import type { AlertaComunicacao } from '@/types/alerta-comunicacao'

export const ALERTAS_COMUNICACAO_STORAGE_KEY = 'craft_comunicacao_alertas_v1'

interface AlertasComunicacaoStore {
  version: 1
  offices: Record<string, AlertaComunicacao[]>
}

export function loadAlertasStore(): AlertasComunicacaoStore {
  try {
    const raw = localStorage.getItem(ALERTAS_COMUNICACAO_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AlertasComunicacaoStore
  } catch {
    /* seed */
  }
  return { version: 1, offices: {} }
}

export function saveAlertasStore(store: AlertasComunicacaoStore): void {
  localStorage.setItem(ALERTAS_COMUNICACAO_STORAGE_KEY, JSON.stringify(store))
}

export function listarAlertasLocal(officeId: string): AlertaComunicacao[] {
  const store = loadAlertasStore()
  return (store.offices[officeId] ?? []).sort((a, b) => {
    const prio = prioridadeOrdem(a.prioridade) - prioridadeOrdem(b.prioridade)
    if (prio !== 0) return prio
    return a.due_date.localeCompare(b.due_date)
  })
}

function prioridadeOrdem(p: AlertaComunicacao['prioridade']): number {
  switch (p) {
    case 'vencido':
      return 0
    case 'hoje':
      return 1
    case 'proximos_dias':
      return 2
    default:
      return 3
  }
}

export function salvarAlertasOfficeLocal(officeId: string, itens: AlertaComunicacao[]): void {
  const store = loadAlertasStore()
  store.offices[officeId] = [...itens]
  saveAlertasStore(store)
}

export function obterAlertaPorLocalId(
  officeId: string,
  localId: string
): AlertaComunicacao | undefined {
  return listarAlertasLocal(officeId).find((a) => a.local_id === localId)
}

export function mesclarAlertas(local: AlertaComunicacao[], remoto: AlertaComunicacao[]): AlertaComunicacao[] {
  const porId = new Map<string, AlertaComunicacao>()
  for (const item of remoto) porId.set(item.id, item)
  for (const item of local) {
    const existente = porId.get(item.id)
    if (!existente) {
      porId.set(item.id, item)
      continue
    }
    const localTs = item.updated_at ?? ''
    const remotoTs = existente.updated_at ?? ''
    porId.set(item.id, remotoTs >= localTs ? existente : item)
  }
  return [...porId.values()]
}
