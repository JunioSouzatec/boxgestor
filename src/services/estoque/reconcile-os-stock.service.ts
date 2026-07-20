import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { demandaDesejadaDaOS } from '@/services/estoque.service'
import { pullEstoqueDoSupabase } from '@/services/estoque/estoque-sync.service'
import { statusExigeBaixaEstoque } from '@/services/os-status.service'
import { emitirEventoPersistencia } from '@/services/persistence-status.events'
import type { OrdemServico } from '@/types'

export interface DemandaEstoqueOsItem {
  item_local_id: string
  desired_qty: number
  unit_cost?: number
  nome?: string
}

export interface ResultadoReconciliacaoOs {
  ok: boolean
  via: 'rpc' | 'local'
  mensagem?: string
  data?: unknown
}

/** Monta demanda da OS para a RPC (orçamento/cancelada = vazia → estorno total). */
export function montarDemandaReconciliacaoOs(os: OrdemServico): DemandaEstoqueOsItem[] {
  if (ehDocumentoOrcamento(os) || os.status === 'cancelada' || !statusExigeBaixaEstoque(os.status)) {
    return []
  }
  const demanda = demandaDesejadaDaOS(os)
  return [...demanda.entries()].map(([pecaId, info]) => ({
    item_local_id: pecaId,
    desired_qty: info.qtd,
    unit_cost: info.valor_unitario,
    nome: info.nome,
  }))
}

function logReconcile(evento: string, payload: Record<string, unknown>): void {
  // Telemetria RC1 visível em produção no console do navegador
  console.info(`[Craft Estoque][reconcile_os_stock] ${evento}`, payload)
}

/**
 * Reconcilia estoque da OS no Supabase (transacional/idempotente).
 *
 * IMPORTANTE: NÃO publica movimentos locais antes da RPC.
 * Publicar devolução local primeiro fazia applied=0 e a RPC NÃO atualizava quantity
 * (estorno “fantasma” — estoque ficava 9 com OS cancelada).
 */
export async function reconciliarEstoqueOsComSupabase(
  officeIdLocal: string,
  os: OrdemServico,
  usuario?: { id?: string; nome?: string }
): Promise<ResultadoReconciliacaoOs> {
  if (!isSupabaseConfigured()) {
    return { ok: false, via: 'local', mensagem: 'Supabase não configurado' }
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, via: 'local', mensagem: 'offline' }
  }

  const supabase = getSupabaseClient()
  const contexto = await obterContextoOfficeSupabase(officeIdLocal)
  if (!supabase || !contexto?.officeUuid) {
    return { ok: false, via: 'local', mensagem: 'sem_contexto_office' }
  }

  const demand = montarDemandaReconciliacaoOs(os)
  const userIdUuid =
    usuario?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuario.id)
      ? usuario.id
      : null

  logReconcile('chamada', {
    officeIdLocal,
    officeUuid: contexto.officeUuid,
    osId: os.id,
    osNumero: os.numero,
    status: os.status,
    demanda: demand,
    demandaVazia: demand.length === 0,
    usuario: usuario?.nome,
  })

  const { data, error } = await // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any).rpc('reconcile_os_stock', {
    p_office_id: contexto.officeUuid,
    p_os_local_id: os.id,
    p_os_numero: os.numero ?? null,
    p_demand: demand,
    p_user_id: userIdUuid,
    p_user_name: usuario?.nome ?? null,
  })

  if (error) {
    logReconcile('erro', {
      officeIdLocal,
      osId: os.id,
      status: os.status,
      demanda: demand,
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    emitirEventoPersistencia({
      type: 'fallback',
      escopo: 'os',
      mensagem: `Falha ao reconciliar estoque da OS #${os.numero ?? os.id}: ${error.message}`,
    })
    // Pull para não ficar com UI otimista errada
    await pullEstoqueDoSupabase(officeIdLocal)
    return { ok: false, via: 'local', mensagem: error.message, data }
  }

  logReconcile('sucesso', {
    officeIdLocal,
    osId: os.id,
    status: os.status,
    demanda: demand,
    resposta: data,
  })

  const pull = await pullEstoqueDoSupabase(officeIdLocal)
  if (!pull.ok) {
    logReconcile('pull_apos_rpc_falhou', { officeIdLocal, osId: os.id })
  }

  return { ok: true, via: 'rpc', data }
}

/** True quando a OS exige reconciliação remota imediata (baixa ou estorno). */
export function osExigeReconciliacaoEstoqueRemota(
  os: Pick<OrdemServico, 'status' | 'modo_documento'>,
  mudouEstoqueLocal: boolean
): boolean {
  if (ehDocumentoOrcamento(os)) return false
  if (os.status === 'cancelada') return true
  if (mudouEstoqueLocal) return true
  if (statusExigeBaixaEstoque(os.status) && mudouEstoqueLocal) return true
  return mudouEstoqueLocal
}
