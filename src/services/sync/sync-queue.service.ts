import { gerarId } from '@/lib/utils'
import type {
  SyncActionType,
  SyncEntity,
  SyncQueueItem,
  SyncQueueStore,
  SyncStatus,
} from '@/types/sync'
import { SYNC_QUEUE_STORAGE_KEY } from '@/types/sync'

export interface EnfileirarSyncInput {
  office_id: string
  tipo_acao: SyncActionType
  entidade: SyncEntity
  entidade_id: string
  payload?: unknown
}

function loadStore(): SyncQueueStore {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as SyncQueueStore
  } catch {
    /* seed */
  }
  return { version: 1, items: [] }
}

function saveStore(store: SyncQueueStore): void {
  localStorage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify(store))
}

export class SyncQueueService {
  listar(officeId?: string, status?: SyncStatus): SyncQueueItem[] {
    const store = loadStore()
    return store.items
      .filter((i) => (officeId ? i.office_id === officeId : true))
      .filter((i) => (status ? i.status === status : true))
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
  }

  contarPendentes(officeId: string): number {
    return this.listar(officeId, 'pendente').length
  }

  enfileirar(input: EnfileirarSyncInput): SyncQueueItem {
    const store = loadStore()
    const agora = new Date().toISOString()

    const existente = store.items.find(
      (i) =>
        i.office_id === input.office_id &&
        i.entidade === input.entidade &&
        i.entidade_id === input.entidade_id &&
        i.tipo_acao === input.tipo_acao &&
        i.status === 'pendente'
    )

    if (existente) {
      existente.payload = input.payload
      existente.atualizado_em = agora
      saveStore(store)
      return existente
    }

    const item: SyncQueueItem = {
      id: gerarId(),
      office_id: input.office_id,
      tipo_acao: input.tipo_acao,
      entidade: input.entidade,
      entidade_id: input.entidade_id,
      payload: input.payload,
      criado_em: agora,
      atualizado_em: agora,
      status: 'pendente',
      tentativas: 0,
    }
    store.items.push(item)
    saveStore(store)
    return item
  }

  marcarSincronizado(id: string): SyncQueueItem | null {
    const store = loadStore()
    const idx = store.items.findIndex((i) => i.id === id)
    if (idx === -1) return null
    store.items[idx].status = 'sincronizado'
    store.items[idx].atualizado_em = new Date().toISOString()
    store.items[idx].erro_mensagem = undefined
    saveStore(store)
    return store.items[idx]
  }

  marcarErro(id: string, mensagem: string): SyncQueueItem | null {
    const store = loadStore()
    const idx = store.items.findIndex((i) => i.id === id)
    if (idx === -1) return null
    store.items[idx].status = 'erro'
    store.items[idx].erro_mensagem = mensagem
    store.items[idx].tentativas += 1
    store.items[idx].atualizado_em = new Date().toISOString()
    saveStore(store)
    return store.items[idx]
  }

  reprocessar(id: string): SyncQueueItem | null {
    const store = loadStore()
    const idx = store.items.findIndex((i) => i.id === id)
    if (idx === -1) return null
    store.items[idx].status = 'pendente'
    store.items[idx].erro_mensagem = undefined
    store.items[idx].atualizado_em = new Date().toISOString()
    saveStore(store)
    return store.items[idx]
  }

  /** Remove itens pendentes de sync_fase1 (não reprocessar automaticamente no login) */
  limparPendentesFase1(officeId: string): number {
    const store = loadStore()
    const antes = store.items.length
    store.items = store.items.filter(
      (i) =>
        !(
          i.office_id === officeId &&
          i.status === 'pendente' &&
          i.entidade === 'configuracao' &&
          i.payload &&
          typeof i.payload === 'object' &&
          (i.payload as { sync_fase1?: boolean }).sync_fase1
        )
    )
    saveStore(store)
    return antes - store.items.length
  }

  marcarSincronizadosPorEntidade(
    officeId: string,
    entidade: SyncEntity,
    entidadeId: string
  ): number {
    const store = loadStore()
    const agora = new Date().toISOString()
    let alterados = 0
    for (const item of store.items) {
      if (
        item.office_id === officeId &&
        item.entidade === entidade &&
        item.entidade_id === entidadeId &&
        item.status === 'pendente'
      ) {
        item.status = 'sincronizado'
        item.atualizado_em = agora
        item.erro_mensagem = undefined
        alterados++
      }
    }
    if (alterados > 0) saveStore(store)
    return alterados
  }

  limparSincronizados(officeId: string, maisAntigosQueDias = 7): number {
    const store = loadStore()
    const limite = new Date()
    limite.setDate(limite.getDate() - maisAntigosQueDias)
    const limiteIso = limite.toISOString()
    const antes = store.items.length
    store.items = store.items.filter(
      (i) =>
        !(
          i.office_id === officeId &&
          i.status === 'sincronizado' &&
          i.atualizado_em < limiteIso
        )
    )
    saveStore(store)
    return antes - store.items.length
  }
}

export const syncQueueService = new SyncQueueService()
