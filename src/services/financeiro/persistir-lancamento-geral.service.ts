/**
 * Persistência dedicada de despesa/receita geral (Contas a pagar/receber).
 * Sem caminho de OS/caixa. Update → lookup → insert, com logs do erro real.
 */
import { dataLocalParaIso, isUuidFormato, localIdParaUuid } from '@/lib/local-id-uuid'
import { getDataLocalHoje } from '@/lib/data-local'
import { MSG } from '@/lib/mensagens-usuario'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import {
  sanitizarDataSupabase,
  sanitizarNumeroSupabase,
  sanitizarTextoObrigatorioSupabase,
} from '@/lib/supabase-sanitize'
import { obterClientPaymentId } from '@/services/pagamentos/payment-dedupe.helpers'
import { obterCurrentOfficeIdRpc } from '@/services/supabase-sync/payment-sync.helpers'
import {
  mapearFormaPagamentoParaSupabase,
} from '@/services/supabase-sync/payment-mappers'
import { registrarMapeamentoId } from '@/services/supabase-sync/id-registry'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { PostgrestError } from '@supabase/supabase-js'

export interface ErroSupabaseFinanceiro {
  code?: string
  message?: string
  details?: string
  hint?: string
  status?: number
}

export interface ResultadoPersistirLancamentoGeral {
  ok: boolean
  financial_id?: string
  operacao?: 'update' | 'insert'
  mensagem: string
  erro?: ErroSupabaseFinanceiro
}

function erroDePostgrest(error: PostgrestError | null): ErroSupabaseFinanceiro | undefined {
  if (!error) return undefined
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  }
}

function buildCraftMetaGeral(lancamento: LancamentoFinanceiro) {
  const clientPaymentId = obterClientPaymentId(lancamento)
  const metaExtra = lancamento.craft_meta ?? {}
  return {
    ...metaExtra,
    local_id: lancamento.id,
    client_payment_id: clientPaymentId,
    descricao: lancamento.descricao,
    forma_pagamento_original: lancamento.forma_pagamento,
    parcelas: lancamento.parcelas ?? metaExtra.installments ?? null,
    observacao: lancamento.observacao ?? null,
    usuario_id: lancamento.usuario_id ?? null,
    usuario_nome: lancamento.usuario_nome ?? null,
    cancelado: lancamento.cancelado ?? false,
    pago: lancamento.pago,
    vencimento: lancamento.vencimento ?? null,
    status: lancamento.cancelado ? 'cancelado' : lancamento.pago ? 'pago' : 'pendente',
    origin_type: metaExtra.origin_type ?? undefined,
    origin_id: metaExtra.origin_id ?? undefined,
    counter_sale_id: metaExtra.counter_sale_id ?? undefined,
    payment_method_base: metaExtra.payment_method_base ?? undefined,
    payment_method_label: metaExtra.payment_method_label ?? undefined,
    installments: metaExtra.installments ?? lancamento.parcelas ?? null,
  }
}

/** Payload mínimo alinhado ao schema real de financial_transactions. */
async function montarPayloadFinanceiro(
  lancamento: LancamentoFinanceiro,
  officeUuid: string,
  financialId: string
): Promise<Record<string, unknown>> {
  const clientPaymentId = obterClientPaymentId(lancamento)
  const payload: Record<string, unknown> = {
    id: financialId,
    office_id: officeUuid,
    type: lancamento.tipo,
    description: sanitizarTextoObrigatorioSupabase(lancamento.descricao, 'Lançamento'),
    amount: sanitizarNumeroSupabase(lancamento.valor, 0),
    payment_method: mapearFormaPagamentoParaSupabase(
      lancamento.forma_pagamento,
      lancamento.parcelas
    ),
    transaction_date: sanitizarDataSupabase(lancamento.data) ?? getDataLocalHoje(),
    paid: lancamento.cancelado ? false : Boolean(lancamento.pago),
    due_date: lancamento.vencimento ? sanitizarDataSupabase(lancamento.vencimento) : null,
    service_order_id: null,
    customer_id: null,
    client_payment_id: clientPaymentId,
    craft_meta: buildCraftMetaGeral(lancamento),
    created_at: dataLocalParaIso(lancamento.created_at ?? lancamento.criado_em),
    updated_at: dataLocalParaIso(lancamento.updated_at ?? lancamento.atualizado_em),
  }
  // Só envia service_order_payment_id se for UUID válido (evita lixo / coluna FK).
  if (
    lancamento.ordem_servico_id &&
    lancamento.payment_supabase_id &&
    isUuidFormato(lancamento.payment_supabase_id)
  ) {
    // Despesa geral não usa SOP; não incluir.
  }
  return payload
}

async function buscarPorClientPaymentId(
  officeUuid: string,
  clientPaymentId: string
): Promise<{ id: string | null; erro?: ErroSupabaseFinanceiro }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { id: null, erro: { message: 'Cliente Supabase indisponível' } }

  const { data, error } = await supabase
    .from('financial_transactions')
    .select('id')
    .eq('office_id', officeUuid)
    .eq('client_payment_id', clientPaymentId)
    .maybeSingle<{ id: string }>()

  if (error) return { id: null, erro: erroDePostgrest(error) }
  return { id: data?.id ? String(data.id) : null }
}

async function buscarPorCraftMetaLocalId(
  officeUuid: string,
  localId: string,
  clientPaymentId: string
): Promise<{ id: string | null; erro?: ErroSupabaseFinanceiro }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { id: null, erro: { message: 'Cliente Supabase indisponível' } }

  const porLocal = await supabase
    .from('financial_transactions')
    .select('id')
    .eq('office_id', officeUuid)
    .filter('craft_meta->>local_id', 'eq', localId)
    .maybeSingle<{ id: string }>()

  if (porLocal.error) return { id: null, erro: erroDePostgrest(porLocal.error) }
  if (porLocal.data?.id) return { id: String(porLocal.data.id) }

  const porClient = await supabase
    .from('financial_transactions')
    .select('id')
    .eq('office_id', officeUuid)
    .filter('craft_meta->>client_payment_id', 'eq', clientPaymentId)
    .maybeSingle<{ id: string }>()

  if (porClient.error) return { id: null, erro: erroDePostgrest(porClient.error) }
  return { id: porClient.data?.id ? String(porClient.data.id) : null }
}

async function atualizarPorId(
  officeUuid: string,
  financialId: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; found: boolean; erro?: ErroSupabaseFinanceiro }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, found: false, erro: { message: 'Cliente Supabase indisponível' } }

  const updateBody = {
    type: payload.type,
    description: payload.description,
    amount: payload.amount,
    payment_method: payload.payment_method,
    transaction_date: payload.transaction_date,
    paid: payload.paid,
    due_date: payload.due_date,
    client_payment_id: payload.client_payment_id,
    craft_meta: payload.craft_meta,
    updated_at: payload.updated_at,
  }

  console.info('[Financeiro][marcar-pago:payload-supabase]', {
    tabela: 'financial_transactions',
    operacao: 'update',
    filtro: { id: financialId, office_id: officeUuid },
    conflict_target: null,
    payload: updateBody,
  })

  const { data, error } = await supabase
    .from('financial_transactions')
    .update(updateBody as never)
    .eq('id', financialId)
    .eq('office_id', officeUuid)
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error) {
    console.error('[Financeiro][marcar-pago:erro]', {
      operacao: 'update',
      error: erroDePostgrest(error),
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      payload: updateBody,
    })
    return { ok: false, found: false, erro: erroDePostgrest(error) }
  }

  return { ok: true, found: Boolean(data?.id) }
}

async function inserirNovo(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; id?: string; erro?: ErroSupabaseFinanceiro }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: { message: 'Cliente Supabase indisponível' } }

  console.info('[Financeiro][marcar-pago:payload-supabase]', {
    tabela: 'financial_transactions',
    operacao: 'insert',
    filtro: null,
    conflict_target: null,
    payload,
  })

  const { data, error } = await supabase
    .from('financial_transactions')
    .insert(payload as never)
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error) {
    console.error('[Financeiro][marcar-pago:erro]', {
      operacao: 'insert',
      error: erroDePostgrest(error),
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      payload,
    })
    return { ok: false, erro: erroDePostgrest(error) }
  }

  return { ok: true, id: data?.id ? String(data.id) : String(payload.id) }
}

/**
 * Persiste despesa/receita geral no Supabase sem upsert cego.
 */
export async function persistirLancamentoGeralPagoNoSupabase(
  officeLocalId: string,
  lancamento: LancamentoFinanceiro
): Promise<ResultadoPersistirLancamentoGeral> {
  if (!isSupabaseConfigured()) {
    return { ok: false, mensagem: 'Supabase não configurado' }
  }

  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  const currentOfficeId = await obterCurrentOfficeIdRpc()

  console.info('[Financeiro][marcar-pago:start]', {
    lancamento,
    id: lancamento.id,
    local_id: lancamento.id,
    client_payment_id: obterClientPaymentId(lancamento),
    payment_supabase_id: lancamento.payment_supabase_id,
    tipo: lancamento.tipo,
    valor: lancamento.valor,
    pago: lancamento.pago,
    office_id_local: officeLocalId,
    office_uuid: contexto?.officeUuid,
    current_office_id: currentOfficeId,
    user_id: contexto?.userId,
    sync_pendente: lancamento.sync_pendente,
  })

  if (!contexto?.officeUuid) {
    const erro = {
      message: 'Profile sem office_id — não é possível gravar no Supabase',
    }
    console.error('[Financeiro][marcar-pago:erro]', erro)
    return { ok: false, mensagem: MSG.erroSalvar, erro }
  }

  if (currentOfficeId && currentOfficeId !== contexto.officeUuid) {
    console.warn('[Financeiro][marcar-pago:start] office_id diverge do current_office_id', {
      office_uuid: contexto.officeUuid,
      current_office_id: currentOfficeId,
    })
  }

  const officeUuid = contexto.officeUuid
  const clientPaymentId = obterClientPaymentId(lancamento)
  const idDeterministico = await localIdParaUuid(`fin:${lancamento.id}`)

  let financialId: string | null =
    lancamento.payment_supabase_id && isUuidFormato(lancamento.payment_supabase_id)
      ? lancamento.payment_supabase_id.trim()
      : null

  // 1) Update por payment_supabase_id
  if (financialId) {
    const payload = await montarPayloadFinanceiro(lancamento, officeUuid, financialId)
    const upd = await atualizarPorId(officeUuid, financialId, payload)
    if (upd.ok && upd.found) {
      registrarMapeamentoId(lancamento.id, financialId)
      registrarMapeamentoId(`fin:${lancamento.id}`, financialId)
      return {
        ok: true,
        financial_id: financialId,
        operacao: 'update',
        mensagem: MSG.pagamentoRegistrado,
      }
    }
    if (upd.erro && upd.erro.code !== 'PGRST116') {
      // Erro real de update (RLS/payload) — ainda tenta achar por client_payment_id
      console.warn('[Financeiro] update por id falhou; tentando lookup', upd.erro)
    }
  }

  // 2) Lookup client_payment_id
  const porClient = await buscarPorClientPaymentId(officeUuid, clientPaymentId)
  if (porClient.erro) {
    console.error('[Financeiro][marcar-pago:erro]', {
      etapa: 'lookup_client_payment_id',
      ...porClient.erro,
    })
  }
  if (porClient.id) financialId = porClient.id

  // 3) Lookup craft_meta
  if (!financialId) {
    const porMeta = await buscarPorCraftMetaLocalId(
      officeUuid,
      lancamento.id,
      clientPaymentId
    )
    if (porMeta.erro) {
      console.error('[Financeiro][marcar-pago:erro]', {
        etapa: 'lookup_craft_meta',
        ...porMeta.erro,
      })
    }
    if (porMeta.id) financialId = porMeta.id
  }

  // 4) Update registro existente
  if (financialId) {
    const payload = await montarPayloadFinanceiro(lancamento, officeUuid, financialId)
    const upd = await atualizarPorId(officeUuid, financialId, payload)
    if (upd.ok && upd.found) {
      registrarMapeamentoId(lancamento.id, financialId)
      registrarMapeamentoId(`fin:${lancamento.id}`, financialId)
      return {
        ok: true,
        financial_id: financialId,
        operacao: 'update',
        mensagem: MSG.pagamentoRegistrado,
      }
    }
    if (upd.erro) {
      return {
        ok: false,
        mensagem: MSG.erroSalvar,
        erro: upd.erro,
      }
    }
  }

  // 5) Insert novo
  const idInsert = financialId ?? idDeterministico
  const payloadInsert = await montarPayloadFinanceiro(lancamento, officeUuid, idInsert)
  const ins = await inserirNovo(payloadInsert)

  if (ins.ok && ins.id) {
    registrarMapeamentoId(lancamento.id, ins.id)
    registrarMapeamentoId(`fin:${lancamento.id}`, ins.id)
    return {
      ok: true,
      financial_id: ins.id,
      operacao: 'insert',
      mensagem: MSG.pagamentoRegistrado,
    }
  }

  // 6) 23505 → select + update
  if (ins.erro?.code === '23505') {
    console.warn('[Financeiro] insert 23505 — recuperando por client_payment_id')
    const existente = await buscarPorClientPaymentId(officeUuid, clientPaymentId)
    const idExistente =
      existente.id ??
      (await buscarPorCraftMetaLocalId(officeUuid, lancamento.id, clientPaymentId)).id

    if (idExistente) {
      const payload = await montarPayloadFinanceiro(lancamento, officeUuid, idExistente)
      const upd = await atualizarPorId(officeUuid, idExistente, payload)
      if (upd.ok && upd.found) {
        registrarMapeamentoId(lancamento.id, idExistente)
        registrarMapeamentoId(`fin:${lancamento.id}`, idExistente)
        return {
          ok: true,
          financial_id: idExistente,
          operacao: 'update',
          mensagem: MSG.pagamentoRegistrado,
        }
      }
      return {
        ok: false,
        mensagem: MSG.erroSalvar,
        erro: upd.erro ?? ins.erro,
      }
    }
  }

  return {
    ok: false,
    mensagem: MSG.erroSalvar,
    erro: ins.erro,
  }
}
