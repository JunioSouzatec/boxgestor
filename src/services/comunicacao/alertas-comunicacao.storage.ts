import type { AlertaComunicacao, StatusAlertaComunicacao } from '@/types/alerta-comunicacao'

export const ALERTAS_COMUNICACAO_STORAGE_KEY = 'craft_comunicacao_alertas_v1'

interface AlertasComunicacaoStore {
  version: 1
  offices: Record<string, AlertaComunicacao[]>
}

const STATUS_TERMINAL: StatusAlertaComunicacao[] = ['enviado', 'resolvido', 'adiado']

function statusEhTerminal(status: StatusAlertaComunicacao): boolean {
  return STATUS_TERMINAL.includes(status)
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

/** Escolhe o registro vencedor — status terminal nunca regride para pendente. */
export function escolherAlertaVencedor(
  a: AlertaComunicacao,
  b: AlertaComunicacao
): AlertaComunicacao {
  const aTerminal = statusEhTerminal(a.status)
  const bTerminal = statusEhTerminal(b.status)

  if (aTerminal && !bTerminal) return a
  if (bTerminal && !aTerminal) return b

  const tsA = a.updated_at ?? ''
  const tsB = b.updated_at ?? ''
  return tsA >= tsB ? a : b
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

export interface OpcoesMesclarAlertas {
  /** Supabase é fonte principal — local só complementa ou vence se mais recente/terminal. */
  prioridadeRemota?: boolean
}

export function mesclarAlertas(
  local: AlertaComunicacao[],
  remoto: AlertaComunicacao[],
  opcoes: OpcoesMesclarAlertas = {}
): AlertaComunicacao[] {
  const porLocalId = new Map<string, AlertaComunicacao>()

  if (opcoes.prioridadeRemota) {
    for (const item of remoto) {
      porLocalId.set(item.local_id, item)
    }
    for (const item of local) {
      const existente = porLocalId.get(item.local_id)
      if (!existente) {
        porLocalId.set(item.local_id, item)
        continue
      }
      porLocalId.set(item.local_id, escolherAlertaVencedor(item, existente))
    }
    return [...porLocalId.values()]
  }

  for (const item of remoto) {
    porLocalId.set(item.local_id, item)
  }
  for (const item of local) {
    const existente = porLocalId.get(item.local_id)
    if (!existente) {
      porLocalId.set(item.local_id, item)
      continue
    }
    porLocalId.set(item.local_id, escolherAlertaVencedor(item, existente))
  }
  return [...porLocalId.values()]
}
