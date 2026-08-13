/**
 * Evita que o push local (status ainda "enviado") sobrescreva aprovação
 * gravada pela Edge Function approval-link-respond.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { metaTemRespostaCliente } from '@/lib/orcamento-aprovacao-estado'
import type { AprovacaoClienteMeta } from '@/types/aprovacao-orcamento'

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function budgetPendente(status: unknown): boolean {
  const s = typeof status === 'string' ? status : ''
  return (
    !s ||
    s === 'rascunho' ||
    s === 'enviado' ||
    s === 'aguardando_aprovacao'
  )
}

function extrairAprovacao(partsUsed: unknown): AprovacaoClienteMeta | null {
  const parts = asRecord(partsUsed)
  const meta = asRecord(parts?.craft_meta)
  const aprov = meta?.aprovacao_cliente
  if (!aprov || typeof aprov !== 'object') return null
  return aprov as AprovacaoClienteMeta
}

function maxIso(a: unknown, b: unknown): string {
  const sa = typeof a === 'string' ? a : ''
  const sb = typeof b === 'string' ? b : ''
  if (!sa) return sb || new Date().toISOString()
  if (!sb) return sa
  return sa >= sb ? sa : sb
}

/**
 * Para cada row de service_orders a enviar: se o remoto já tem resposta do cliente
 * e o payload local ainda não, preserva aprovacao_cliente + budget_status remotos.
 */
export async function preservarAprovacaoClienteNoPush(
  supabase: SupabaseClient,
  officeUuid: string,
  orderRows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (orderRows.length === 0) return orderRows

  const ids = orderRows
    .map((r) => (typeof r.id === 'string' ? r.id : ''))
    .filter(Boolean)

  if (ids.length === 0) return orderRows

  const { data, error } = await supabase
    .from('service_orders')
    .select('id, budget_status, parts_used, updated_at')
    .eq('office_id', officeUuid)
    .in('id', ids)

  if (error || !data?.length) return orderRows

  const remotoPorId = new Map(
    data.map((row) => [String((row as { id: string }).id), row as {
      id: string
      budget_status: string | null
      parts_used: unknown
      updated_at: string
    }])
  )

  return orderRows.map((row) => {
    const id = typeof row.id === 'string' ? row.id : ''
    const remoto = id ? remotoPorId.get(id) : undefined
    if (!remoto) return row

    const aprovLocal = extrairAprovacao(row.parts_used)
    const aprovRemoto = extrairAprovacao(remoto.parts_used)
    const localRespondeu = metaTemRespostaCliente(aprovLocal)
    const remotoRespondeu = metaTemRespostaCliente(aprovRemoto)
    const remotoBudgetFinal =
      remoto.budget_status === 'aprovado' ||
      remoto.budget_status === 'recusado' ||
      remoto.budget_status === 'convertido'

    const precisaPreservar =
      (remotoRespondeu && !localRespondeu) ||
      (remotoBudgetFinal && budgetPendente(row.budget_status))

    if (!precisaPreservar) return row

    const partsLocal = asRecord(row.parts_used) || { pecas: [], craft_meta: {} }
    const craftLocal = asRecord(partsLocal.craft_meta) || {}
    const partsRemoto = asRecord(remoto.parts_used) || {}
    const craftRemoto = asRecord(partsRemoto.craft_meta) || {}

    const historicoLocal = Array.isArray(craftLocal.historico_eventos)
      ? craftLocal.historico_eventos
      : []
    const historicoRemoto = Array.isArray(craftRemoto.historico_eventos)
      ? craftRemoto.historico_eventos
      : []

    const craftMeta = {
      ...craftLocal,
      aprovacao_cliente: remotoRespondeu
        ? aprovRemoto
        : craftLocal.aprovacao_cliente ?? null,
      historico_eventos:
        historicoRemoto.length >= historicoLocal.length ? historicoRemoto : historicoLocal,
    }

    return {
      ...row,
      parts_used: {
        ...partsLocal,
        craft_meta: craftMeta,
      },
      budget_status: remotoBudgetFinal ? remoto.budget_status : row.budget_status,
      updated_at: maxIso(row.updated_at, remoto.updated_at),
    }
  })
}
