import { getCraftPersistenceMode } from '@/lib/supabase'
import { getSupabaseClient } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { emitirDiagnosticoPendenciasAtualizado } from '@/services/persistence-status.events'
import { localCraftRepository } from '@/services/repository/local.repository'
import {
  assinaturaPagamentoOs,
  obterClientPaymentId,
  precisaSincronizarPagamento,
} from '@/services/pagamentos/payment-dedupe.helpers'
import { registrarAuditoriaSyncPendencia } from '@/services/pagamentos/payment-sync-audit.storage'
import { ehPagamentoOS } from '@/services/supabase-sync/payment-mappers'
import { marcarPularPersistenciaRemotaProxima } from '@/services/supabase-sync/persistencia-opcoes'
import { obterUuidPorLocalId } from '@/services/supabase-sync/id-registry'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import type { CraftDatabase } from '@/types/database'
import type { LancamentoFinanceiro } from '@/types/financeiro'

export interface DetalheReconciliacaoPendencia {
  lancamento_id: string
  motivo: string
  origem: 'supabase' | 'local'
}

export interface ResultadoReconciliacaoPendencias {
  db: CraftDatabase
  limpos: number
  detalhes: DetalheReconciliacaoPendencia[]
}

function encontrarGemeloSincronizadoLocal(
  l: LancamentoFinanceiro,
  todos: LancamentoFinanceiro[]
): LancamentoFinanceiro | null {
  const sig = assinaturaPagamentoOs(l)
  if (!sig) return null
  return (
    todos.find(
      (o) =>
        o.id !== l.id &&
        !o.cancelado &&
        !o.sync_arquivado &&
        o.payment_supabase_id &&
        assinaturaPagamentoOs(o) === sig
    ) ?? null
  )
}

function limparFlagsSincronizado(
  l: LancamentoFinanceiro,
  paymentSupabaseId: string
): LancamentoFinanceiro {
  return {
    ...l,
    payment_supabase_id: paymentSupabaseId,
    client_payment_id: obterClientPaymentId(l),
    sync_pendente: false,
    sync_orfao: false,
    sync_orfao_motivo: undefined,
  }
}

export async function verificarPagamentoOsExisteNoSupabase(
  officeUuid: string,
  l: LancamentoFinanceiro
): Promise<string | null> {
  const supabase = getSupabaseClient()
  if (!supabase || !l.ordem_servico_id || !ehPagamentoOS(l)) return null

  const osUuid = obterUuidPorLocalId(l.ordem_servico_id)
  if (!osUuid) return null

  const clientPaymentId = obterClientPaymentId(l)

  const { data: byClientId } = await supabase
    .from('service_order_payments')
    .select('id')
    .eq('office_id', officeUuid)
    .eq('service_order_id', osUuid)
    .eq('client_payment_id', clientPaymentId)
    .maybeSingle<{ id: string }>()

  if (byClientId?.id) return String(byClientId.id)

  const { data: byMeta } = await supabase
    .from('service_order_payments')
    .select('id')
    .eq('office_id', officeUuid)
    .filter('craft_meta->>local_id', 'eq', l.id)
    .maybeSingle<{ id: string }>()

  if (byMeta?.id) return String(byMeta.id)

  const { data: byMetaClient } = await supabase
    .from('service_order_payments')
    .select('id')
    .eq('office_id', officeUuid)
    .filter('craft_meta->>client_payment_id', 'eq', clientPaymentId)
    .maybeSingle<{ id: string }>()

  return byMetaClient?.id ? String(byMetaClient.id) : null
}

async function reconciliarLancamento(
  l: LancamentoFinanceiro,
  db: CraftDatabase,
  officeUuid: string | undefined,
  consultarSupabase: boolean
): Promise<{ l: LancamentoFinanceiro; limpo?: DetalheReconciliacaoPendencia }> {
  if (l.cancelado || l.sync_arquivado) return { l }

  const pendente = precisaSincronizarPagamento(l) || Boolean(l.sync_pendente)

  if (!pendente) return { l }

  if (l.payment_supabase_id) {
    return {
      l: limparFlagsSincronizado(l, l.payment_supabase_id),
      limpo: {
        lancamento_id: l.id,
        motivo: 'Pagamento já possui ID do Supabase — pendência local obsoleta.',
        origem: 'local',
      },
    }
  }

  const gemelo = encontrarGemeloSincronizadoLocal(l, db.lancamentos)
  if (gemelo?.payment_supabase_id) {
    return {
      l: limparFlagsSincronizado(l, gemelo.payment_supabase_id),
      limpo: {
        lancamento_id: l.id,
        motivo: 'Pagamento equivalente já sincronizado no cache local.',
        origem: 'local',
      },
    }
  }

  if (consultarSupabase && officeUuid) {
    const payId = await verificarPagamentoOsExisteNoSupabase(officeUuid, l)
    if (payId) {
      return {
        l: limparFlagsSincronizado(l, payId),
        limpo: {
          lancamento_id: l.id,
          motivo: 'Pagamento já existe no Supabase; pendência local pode ser removida.',
          origem: 'supabase',
        },
      }
    }
  }

  return { l }
}

export async function reconciliarPendenciasPagamentosOffice(
  officeId: string,
  dadosInput?: CraftDatabase,
  opcoes?: { consultarSupabase?: boolean }
): Promise<ResultadoReconciliacaoPendencias> {
  if (getCraftPersistenceMode() !== 'supabase') {
    return {
      db: dadosInput ?? localCraftRepository.carregar(officeId),
      limpos: 0,
      detalhes: [],
    }
  }

  const consultarSupabase = opcoes?.consultarSupabase !== false
  const db = dadosInput ?? localCraftRepository.carregar(officeId)
  const contexto = consultarSupabase ? await obterContextoOfficeSupabase(officeId) : null
  const officeUuid = contexto?.officeUuid

  const detalhes: DetalheReconciliacaoPendencia[] = []
  const idsLimpos = new Set<string>()
  const lancamentosAtualizados: LancamentoFinanceiro[] = []

  for (const l of db.lancamentos) {
    const { l: atualizado, limpo } = await reconciliarLancamento(
      l,
      db,
      officeUuid,
      consultarSupabase
    )
    lancamentosAtualizados.push(atualizado)
    if (limpo) {
      detalhes.push(limpo)
      idsLimpos.add(limpo.lancamento_id)
      registrarAuditoriaSyncPendencia({
        acao: 'reconciliacao_supabase',
        lancamento_id: limpo.lancamento_id,
        motivo: limpo.motivo,
        payment_supabase_id: atualizado.payment_supabase_id,
      })
    }
  }

  for (const item of syncQueueService.listar(officeId, 'pendente')) {
    if (item.entidade !== 'lancamento') continue
    const lanc = lancamentosAtualizados.find((l) => l.id === item.entidade_id)
    if (!lanc || !precisaSincronizarPagamento(lanc)) {
      syncQueueService.marcarSincronizado(item.id)
    }
  }

  if (idsLimpos.size === 0) {
    return { db, limpos: 0, detalhes: [] }
  }

  for (const id of idsLimpos) {
    syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', id)
  }

  const dbAtualizado: CraftDatabase = { ...db, lancamentos: lancamentosAtualizados }
  marcarPularPersistenciaRemotaProxima()
  localCraftRepository.salvar(officeId, dbAtualizado)

  return { db: dbAtualizado, limpos: idsLimpos.size, detalhes }
}

export async function limparPendenciasJaSincronizadas(
  officeId: string,
  dados?: CraftDatabase
): Promise<ResultadoReconciliacaoPendencias> {
  const result = await reconciliarPendenciasPagamentosOffice(officeId, dados, {
    consultarSupabase: true,
  })
  emitirDiagnosticoPendenciasAtualizado(officeId)
  return result
}
