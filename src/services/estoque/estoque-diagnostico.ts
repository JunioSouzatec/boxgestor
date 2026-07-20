import { entidadeFoiExcluida } from '@/lib/entidade-ativa'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import { localCraftRepository } from '@/services/repository/local.repository'
import { getActiveSyncPendingCount } from '@/services/pagamentos/payment-pending-diagnostic.service'
import type { CraftDatabase } from '@/types/database'
import type { Peca } from '@/types/peca'

const ULTIMO_PULL_KEY = 'craft_estoque_ultimo_pull_v1'

export interface DiagnosticoEstoqueSync {
  officeId: string
  totalLocal: number
  ativasLocal: number
  excluidasLocal: number
  idsAtivas: string[]
  idsExcluidas: string[]
  filaSyncBruta: number
  pendenciasPagamentoAtivas: number
  ultimoPullIso: string | null
  officeIdConfig: string | undefined
}

export function registrarUltimoPullEstoque(officeId: string): void {
  try {
    const raw = localStorage.getItem(ULTIMO_PULL_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    map[officeId] = new Date().toISOString()
    localStorage.setItem(ULTIMO_PULL_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function obterUltimoPullEstoque(officeId: string): string | null {
  try {
    const raw = localStorage.getItem(ULTIMO_PULL_KEY)
    if (!raw) return null
    const map = JSON.parse(raw) as Record<string, string>
    return map[officeId] ?? null
  } catch {
    return null
  }
}

export function diagnosticarEstoqueLocal(officeId: string, db?: CraftDatabase): DiagnosticoEstoqueSync {
  const dados = db ?? localCraftRepository.carregar(officeId)
  const pecas = dados.pecas ?? []
  const ativas = pecas.filter((p) => !entidadeFoiExcluida(p))
  const excluidas = pecas.filter((p) => entidadeFoiExcluida(p))
  return {
    officeId,
    totalLocal: pecas.length,
    ativasLocal: ativas.length,
    excluidasLocal: excluidas.length,
    idsAtivas: ativas.map((p) => p.id),
    idsExcluidas: excluidas.map((p) => p.id),
    filaSyncBruta: syncQueueService.contarPendentes(officeId),
    pendenciasPagamentoAtivas: getActiveSyncPendingCount(officeId, dados),
    ultimoPullIso: obterUltimoPullEstoque(officeId),
    officeIdConfig: dados.configuracao?.office_id ?? dados.configuracao?.id,
  }
}

export function logDiagnosticoEstoque(
  rotulo: string,
  officeId: string,
  extra?: Record<string, unknown>
): void {
  const diag = diagnosticarEstoqueLocal(officeId)
  console.info(`[Craft Estoque][diag] ${rotulo}`, { ...diag, ...extra })
}

/** Resolve peça do estoque para linha da OS (id, senão código/nome). */
export function resolverPecaEstoqueParaLinhaOs(
  pecasAtivas: Peca[],
  linha: { peca_id?: string; codigo?: string; nome?: string }
): Peca | undefined {
  if (linha.peca_id) {
    const byId = pecasAtivas.find((p) => p.id === linha.peca_id)
    if (byId) return byId
  }
  const cod = linha.codigo?.trim().toLowerCase()
  if (cod) {
    const byCod = pecasAtivas.find((p) => p.codigo?.trim().toLowerCase() === cod)
    if (byCod) return byCod
  }
  const nome = linha.nome?.trim().toLowerCase()
  if (nome) {
    return pecasAtivas.find((p) => p.nome?.trim().toLowerCase() === nome)
  }
  return undefined
}
