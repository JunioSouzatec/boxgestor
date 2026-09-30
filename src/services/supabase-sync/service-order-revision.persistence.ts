import { getSupabaseClient } from '@/lib/supabase'
import type { ServiceOrderRow } from '@/services/supabase-sync/reverse-mappers'
import { MENSAGEM_CONFLITO_REVISION_OS } from '@/services/supabase-sync/service-order-revision-error'

export {
  CODIGO_CONFLITO_REVISION_OS,
  ErroConflitoRevisionOs,
  MENSAGEM_CONFLITO_REVISION_OS,
  deveMostrarToastGenericoAoSalvar,
  isErroConflitoRevisionOs,
} from '@/services/supabase-sync/service-order-revision-error'

interface RespostaRpcRevisionOs {
  status?: 'saved' | 'conflict'
  expected_revision?: number | null
  current_revision?: number | null
  service_order?: ServiceOrderRow | null
}

export interface ResultadoPersistirOsComRevision {
  ok: boolean
  conflito: boolean
  revision?: number
  row?: ServiceOrderRow
  erro?: string
}

interface RespostaRpcParRevisionOs {
  status?: 'saved' | 'conflict'
  first?: RespostaRpcRevisionOs
  second?: RespostaRpcRevisionOs
}

export async function persistirOsComRevision(
  row: Record<string, unknown>,
  expectedRevision: number | null
): Promise<ResultadoPersistirOsComRevision> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, conflito: false, erro: 'Cliente Supabase indisponível' }
  }

  const officeId = String(row.office_id ?? '')
  const serviceOrderId = String(row.id ?? '')
  if (!officeId || !serviceOrderId) {
    return { ok: false, conflito: false, erro: 'OS sem identificadores para sincronização' }
  }

  const { data, error } = await supabase.rpc(
    'save_service_order_if_revision' as never,
    {
      p_office_id: officeId,
      p_service_order_id: serviceOrderId,
      p_expected_revision: expectedRevision,
      p_payload: row,
    } as never
  )

  if (error) {
    return { ok: false, conflito: false, erro: error.message }
  }

  const resposta = (data ?? {}) as RespostaRpcRevisionOs
  const rowSalva = resposta.service_order ?? undefined
  if (resposta.status === 'conflict') {
    return {
      ok: false,
      conflito: true,
      revision:
        typeof resposta.current_revision === 'number'
          ? resposta.current_revision
          : undefined,
      row: rowSalva,
      erro: MENSAGEM_CONFLITO_REVISION_OS,
    }
  }

  if (
    resposta.status !== 'saved' ||
    typeof resposta.current_revision !== 'number' ||
    !rowSalva
  ) {
    return { ok: false, conflito: false, erro: 'Resposta inválida ao salvar a OS' }
  }

  return {
    ok: true,
    conflito: false,
    revision: resposta.current_revision,
    row: rowSalva,
  }
}

export async function persistirParOsComRevision(
  primeira: { row: Record<string, unknown>; expectedRevision: number | null },
  segunda: { row: Record<string, unknown>; expectedRevision: number | null }
): Promise<{
  ok: boolean
  conflito: boolean
  primeira?: ResultadoPersistirOsComRevision
  segunda?: ResultadoPersistirOsComRevision
  erro?: string
}> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, conflito: false, erro: 'Cliente Supabase indisponível' }
  }

  const { data, error } = await supabase.rpc(
    'save_service_order_pair_if_revisions' as never,
    {
      p_first_office_id: String(primeira.row.office_id ?? ''),
      p_first_service_order_id: String(primeira.row.id ?? ''),
      p_first_expected_revision: primeira.expectedRevision,
      p_first_payload: primeira.row,
      p_second_office_id: String(segunda.row.office_id ?? ''),
      p_second_service_order_id: String(segunda.row.id ?? ''),
      p_second_expected_revision: segunda.expectedRevision,
      p_second_payload: segunda.row,
    } as never
  )
  if (error) return { ok: false, conflito: false, erro: error.message }

  const resposta = (data ?? {}) as RespostaRpcParRevisionOs
  const converter = (
    item: RespostaRpcRevisionOs | undefined
  ): ResultadoPersistirOsComRevision | undefined => {
    if (!item) return undefined
    return {
      ok: item.status === 'saved',
      conflito: item.status === 'conflict',
      revision:
        typeof item.current_revision === 'number' ? item.current_revision : undefined,
      row: item.service_order ?? undefined,
      erro: item.status === 'conflict' ? MENSAGEM_CONFLITO_REVISION_OS : undefined,
    }
  }
  const resultadoPrimeira = converter(resposta.first)
  const resultadoSegunda = converter(resposta.second)

  return {
    ok:
      resposta.status === 'saved' &&
      Boolean(resultadoPrimeira?.ok) &&
      Boolean(resultadoSegunda?.ok),
    conflito: resposta.status === 'conflict',
    primeira: resultadoPrimeira,
    segunda: resultadoSegunda,
    erro:
      resposta.status === 'conflict'
        ? MENSAGEM_CONFLITO_REVISION_OS
        : resposta.status === 'saved'
          ? undefined
          : 'Resposta inválida ao salvar conversão de orçamento',
  }
}
