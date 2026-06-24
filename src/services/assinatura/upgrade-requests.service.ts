import { gerarId } from '@/lib/utils'
import type { AuthUser } from '@/types/auth'
import type { PlanoTier } from '@/types/plano'
import { normalizarPlanoTier } from '@/types/plano'
import type { UpgradeRequest, UpgradeRequestStatus } from '@/types/upgrade-request'

export const UPGRADE_REQUESTS_STORAGE_KEY = 'craft_upgrade_requests_v1'

interface UpgradeRequestsStore {
  version: 1
  requests: UpgradeRequest[]
}

function loadStore(): UpgradeRequestsStore {
  try {
    const raw = localStorage.getItem(UPGRADE_REQUESTS_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as UpgradeRequestsStore
  } catch {
    /* seed abaixo */
  }
  return { version: 1, requests: [] }
}

function saveStore(store: UpgradeRequestsStore): void {
  localStorage.setItem(UPGRADE_REQUESTS_STORAGE_KEY, JSON.stringify(store))
}

function notificarAlteracao(): void {
  window.dispatchEvent(new CustomEvent('craft-upgrade-requests-updated'))
}

export interface CriarUpgradeRequestInput {
  office_id: string
  office_nome: string
  current_plan: PlanoTier
  requested_plan: PlanoTier
  solicitante: AuthUser
  note?: string
}

export class UpgradeRequestsService {
  listarTodas(): UpgradeRequest[] {
    return loadStore().requests.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  listarPorOficina(officeId: string): UpgradeRequest[] {
    return this.listarTodas().filter((r) => r.office_id === officeId)
  }

  listarPendentes(): UpgradeRequest[] {
    return this.listarTodas().filter((r) => r.status === 'pending')
  }

  obterPorId(id: string): UpgradeRequest | undefined {
    return loadStore().requests.find((r) => r.id === id)
  }

  temPendente(officeId: string, requestedPlan: PlanoTier): boolean {
    return loadStore().requests.some(
      (r) =>
        r.office_id === officeId &&
        r.requested_plan === requestedPlan &&
        r.status === 'pending' &&
        r.current_plan !== r.requested_plan
    )
  }

  temPendenteUsuariosExtras(officeId: string): boolean {
    return loadStore().requests.some(
      (r) =>
        r.office_id === officeId &&
        r.status === 'pending' &&
        r.current_plan === r.requested_plan &&
        Boolean(r.note?.includes('usuários adicionais'))
    )
  }

  criarSolicitacaoUsuariosExtras(
    input: Omit<CriarUpgradeRequestInput, 'requested_plan' | 'note'>
  ): UpgradeRequest {
    const current = normalizarPlanoTier(input.current_plan)

    if (this.temPendenteUsuariosExtras(input.office_id)) {
      throw new Error('Já existe uma solicitação pendente de usuários extras.')
    }

    const agora = new Date().toISOString()
    const request: UpgradeRequest = {
      id: gerarId(),
      office_id: input.office_id,
      office_nome: input.office_nome,
      requested_by: input.solicitante.id,
      requested_by_nome: input.solicitante.nome,
      requested_by_email: input.solicitante.email,
      current_plan: current,
      requested_plan: current,
      status: 'pending',
      note: 'Cliente solicitou usuários adicionais além do limite do plano.',
      created_at: agora,
    }

    const store = loadStore()
    store.requests.push(request)
    saveStore(store)
    notificarAlteracao()
    return request
  }

  criar(input: CriarUpgradeRequestInput): UpgradeRequest {
    const current = normalizarPlanoTier(input.current_plan)
    const requested = normalizarPlanoTier(input.requested_plan)

    if (current === requested) {
      throw new Error('O plano solicitado é igual ao plano atual.')
    }

    if (this.temPendente(input.office_id, requested)) {
      throw new Error('Já existe uma solicitação pendente para este plano.')
    }

    const agora = new Date().toISOString()
    const request: UpgradeRequest = {
      id: gerarId(),
      office_id: input.office_id,
      office_nome: input.office_nome,
      requested_by: input.solicitante.id,
      requested_by_nome: input.solicitante.nome,
      requested_by_email: input.solicitante.email,
      current_plan: current,
      requested_plan: requested,
      status: 'pending',
      note: input.note?.trim() || undefined,
      created_at: agora,
    }

    const store = loadStore()
    store.requests.push(request)
    saveStore(store)
    notificarAlteracao()
    return request
  }

  private atualizarStatus(
    id: string,
    status: UpgradeRequestStatus,
    admin: AuthUser,
    note?: string
  ): UpgradeRequest {
    const store = loadStore()
    const idx = store.requests.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error('Solicitação não encontrada.')

    const atual = store.requests[idx]
    if (atual.status !== 'pending') {
      throw new Error('Esta solicitação já foi processada.')
    }

    const atualizada: UpgradeRequest = {
      ...atual,
      status,
      note: note?.trim() || atual.note,
      decided_at: new Date().toISOString(),
      decided_by: admin.id,
      decided_by_nome: admin.nome,
    }
    store.requests[idx] = atualizada
    saveStore(store)
    notificarAlteracao()
    return atualizada
  }

  aprovar(id: string, admin: AuthUser): UpgradeRequest {
    return this.atualizarStatus(id, 'approved', admin)
  }

  recusar(id: string, admin: AuthUser, note?: string): UpgradeRequest {
    return this.atualizarStatus(id, 'rejected', admin, note)
  }
}

export const upgradeRequestsService = new UpgradeRequestsService()
