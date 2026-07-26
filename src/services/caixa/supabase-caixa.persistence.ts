/**
 * Persistência remota do Caixa (Fases 1A + 2A).
 * Fase 2A: movimentos (cash_movements). Não vincula pagamento de OS no fluxo.
 * Não atualiza cash_sessions.expected_balance ao criar movimentos.
 */

import { isUuidFormato } from '@/lib/local-id-uuid'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import {
  mapearAuditoriaCaixaDoSupabase,
  mapearMovimentoCaixaDoSupabase,
  mapearSessaoCaixaDoSupabase,
  type CashAuditLogRow,
  type CashMovementRow,
  type CashSessionRow,
} from '@/services/caixa/caixa-mappers'
import type {
  AbrirCaixaParams,
  AuditoriaCaixa,
  CancelarMovimentoCaixaParams,
  CriarMovimentoCaixaParams,
  FecharCaixaParams,
  ListarSessoesCaixaFiltros,
  MovimentoCaixa,
  ResultadoCaixa,
  SessaoCaixa,
  TipoMovimentoCaixa,
} from '@/types/caixa'

const TIPOS_MOVIMENTO_VALIDOS: TipoMovimentoCaixa[] = [
  'manual_in',
  'manual_out',
  'sangria',
  'suprimento',
  'sale',
  'refund',
]

async function resolverOfficeUuid(officeId: string): Promise<string | null> {
  const ctx = await obterContextoOfficeSupabase(officeId)
  return ctx?.officeUuid ?? null
}

function mensagemTabelaAusente(erro: string): string | null {
  const msg = erro.toLowerCase()
  if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache')) {
    if (msg.includes('cash_movements')) {
      return 'Tabela cash_movements ainda não existe no Supabase. Aplique a migration cash_movements_base.'
    }
    return 'Tabelas de caixa ainda não existem no Supabase. Aplique as migrations de caixa.'
  }
  return null
}

function uuidOpcional(valor?: string | null): string | null {
  const t = valor?.trim()
  return t && isUuidFormato(t) ? t : null
}

async function registrarAuditLog(params: {
  officeUuid: string
  cashSessionId: string
  action: string
  actorId?: string | null
  actorName?: string | null
  payload?: Record<string, unknown>
}): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return

  const actorId =
    params.actorId?.trim() && isUuidFormato(params.actorId)
      ? params.actorId.trim()
      : null

  const { error } = await supabase.from('cash_audit_logs').insert({
    office_id: params.officeUuid,
    cash_session_id: params.cashSessionId,
    action: params.action,
    actor_id: actorId,
    actor_name: params.actorName?.trim() || null,
    payload: params.payload ?? {},
  } as never)

  if (error) {
    console.warn('[BoxGestor Caixa] Falha ao gravar audit log', error.message)
  }
}

export async function obterCaixaAbertoRemoto(
  officeId: string
): Promise<ResultadoCaixa<SessaoCaixa | null>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: 'Cliente Supabase indisponível' }

  const officeUuid = await resolverOfficeUuid(officeId)
  if (!officeUuid) return { ok: false, erro: 'Sem office_id no perfil' }

  const { data, error } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('office_id', officeUuid)
    .eq('status', 'open')
    .is('deleted_at', null)
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      erro: mensagemTabelaAusente(error.message) ?? error.message,
    }
  }

  if (!data) return { ok: true, dados: null }
  return { ok: true, dados: mapearSessaoCaixaDoSupabase(data as CashSessionRow) }
}

export async function listarSessoesCaixaRemoto(
  officeId: string,
  filtros?: ListarSessoesCaixaFiltros
): Promise<ResultadoCaixa<SessaoCaixa[]>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: 'Cliente Supabase indisponível' }

  const officeUuid = await resolverOfficeUuid(officeId)
  if (!officeUuid) return { ok: false, erro: 'Sem office_id no perfil' }

  const limite = Math.min(Math.max(filtros?.limite ?? 50, 1), 200)

  let query = supabase
    .from('cash_sessions')
    .select('*')
    .eq('office_id', officeUuid)
    .is('deleted_at', null)
    .order('opened_at', { ascending: false })
    .limit(limite)

  if (filtros?.status) {
    query = query.eq('status', filtros.status)
  }

  const { data, error } = await query

  if (error) {
    return {
      ok: false,
      erro: mensagemTabelaAusente(error.message) ?? error.message,
    }
  }

  const lista = ((data ?? []) as CashSessionRow[]).map(mapearSessaoCaixaDoSupabase)
  return { ok: true, dados: lista }
}

export async function abrirCaixaRemoto(
  params: AbrirCaixaParams
): Promise<ResultadoCaixa<SessaoCaixa>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: 'Cliente Supabase indisponível' }

  const officeUuid = await resolverOfficeUuid(params.officeId)
  if (!officeUuid) return { ok: false, erro: 'Sem office_id no perfil' }

  const openingBalance = Number(params.openingBalance)
  if (!Number.isFinite(openingBalance) || openingBalance < 0) {
    return { ok: false, erro: 'Saldo inicial inválido.' }
  }

  const aberto = await obterCaixaAbertoRemoto(params.officeId)
  if (!aberto.ok) return { ok: false, erro: aberto.erro }
  if (aberto.dados) {
    return {
      ok: false,
      erro: 'Já existe um caixa aberto nesta oficina. Feche-o antes de abrir outro.',
    }
  }

  const openedBy =
    params.openedBy?.trim() && isUuidFormato(params.openedBy)
      ? params.openedBy.trim()
      : null
  const agora = new Date().toISOString()

  const linha = {
    office_id: officeUuid,
    opened_by: openedBy,
    opened_by_name: params.openedByName?.trim() || null,
    opened_at: agora,
    closed_at: null,
    opening_balance: openingBalance,
    closing_balance_informed: null,
    // Fase 1A: expected = opening (sem movimentos vinculados)
    expected_balance: openingBalance,
    difference: null,
    status: 'open',
    notes: params.notes?.trim() || null,
    craft_meta: { fase: '1A' },
  }

  const { data, error } = await supabase
    .from('cash_sessions')
    .insert(linha as never)
    .select('*')
    .maybeSingle()

  if (error || !data) {
    const msg = error?.message ?? 'Não foi possível abrir o caixa.'
    if (msg.toLowerCase().includes('cash_sessions_one_open_per_office')) {
      return {
        ok: false,
        erro: 'Já existe um caixa aberto nesta oficina. Feche-o antes de abrir outro.',
      }
    }
    return { ok: false, erro: mensagemTabelaAusente(msg) ?? msg }
  }

  const sessao = mapearSessaoCaixaDoSupabase(data as CashSessionRow)

  await registrarAuditLog({
    officeUuid,
    cashSessionId: sessao.id,
    action: 'cash_session_opened',
    actorId: openedBy,
    actorName: params.openedByName,
    payload: {
      opening_balance: openingBalance,
      expected_balance: openingBalance,
      notes: sessao.notes,
    },
  })

  return { ok: true, dados: sessao }
}

export async function fecharCaixaRemoto(
  params: FecharCaixaParams
): Promise<ResultadoCaixa<SessaoCaixa>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: 'Cliente Supabase indisponível' }

  const officeUuid = await resolverOfficeUuid(params.officeId)
  if (!officeUuid) return { ok: false, erro: 'Sem office_id no perfil' }

  const sessionId = params.sessionId.trim()
  if (!sessionId || !isUuidFormato(sessionId)) {
    return { ok: false, erro: 'Sessão de caixa inválida.' }
  }

  const closing = Number(params.closingBalanceInformed)
  if (!Number.isFinite(closing) || closing < 0) {
    return { ok: false, erro: 'Saldo final informado inválido.' }
  }

  const { data: atual, error: erroBusca } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('office_id', officeUuid)
    .eq('id', sessionId)
    .is('deleted_at', null)
    .maybeSingle()

  if (erroBusca) {
    return {
      ok: false,
      erro: mensagemTabelaAusente(erroBusca.message) ?? erroBusca.message,
    }
  }
  if (!atual) {
    return { ok: false, erro: 'Caixa não encontrado.' }
  }

  const sessaoAtual = mapearSessaoCaixaDoSupabase(atual as CashSessionRow)
  if (sessaoAtual.status !== 'open') {
    return { ok: false, erro: 'Este caixa já está fechado.' }
  }

  // Fase 2B: expected = opening + movimentos ativos (venda/OS ainda não entram)
  const { data: movRows, error: erroMovs } = await supabase
    .from('cash_movements')
    .select('type, amount, deleted_at')
    .eq('office_id', officeUuid)
    .eq('cash_session_id', sessionId)
    .is('deleted_at', null)

  if (erroMovs) {
    return {
      ok: false,
      erro: mensagemTabelaAusente(erroMovs.message) ?? erroMovs.message,
    }
  }

  let totalEntradas = 0
  let totalSaidas = 0
  let totalSangrias = 0
  let totalSuprimentos = 0
  let totalVendas = 0
  let totalEstornos = 0
  for (const row of movRows ?? []) {
    const tipo = String((row as { type?: string }).type ?? '')
    const valor = Number((row as { amount?: number | string }).amount)
    if (!Number.isFinite(valor) || valor <= 0) continue
    switch (tipo) {
      case 'manual_in':
        totalEntradas += valor
        break
      case 'manual_out':
        totalSaidas += valor
        break
      case 'sangria':
        totalSangrias += valor
        break
      case 'suprimento':
        totalSuprimentos += valor
        break
      case 'sale':
        totalVendas += valor
        break
      case 'refund':
        totalEstornos += valor
        break
      default:
        break
    }
  }

  const expected = Number(
    (
      sessaoAtual.opening_balance +
      totalEntradas +
      totalSuprimentos +
      totalVendas -
      totalSaidas -
      totalSangrias -
      totalEstornos
    ).toFixed(2)
  )
  const difference = Number((closing - expected).toFixed(2))
  const closedBy =
    params.closedBy?.trim() && isUuidFormato(params.closedBy)
      ? params.closedBy.trim()
      : null
  const agora = new Date().toISOString()

  const { data, error } = await supabase
    .from('cash_sessions')
    .update({
      status: 'closed',
      closed_at: agora,
      closed_by: closedBy,
      closed_by_name: params.closedByName?.trim() || null,
      closing_balance_informed: closing,
      expected_balance: expected,
      difference,
      notes:
        params.notes !== undefined
          ? params.notes?.trim() || null
          : sessaoAtual.notes,
    } as never)
    .eq('office_id', officeUuid)
    .eq('id', sessionId)
    .eq('status', 'open')
    .is('deleted_at', null)
    .select('*')
    .maybeSingle()

  if (error) {
    return { ok: false, erro: mensagemTabelaAusente(error.message) ?? error.message }
  }
  if (!data) {
    return {
      ok: false,
      erro: 'Não foi possível fechar o caixa (pode já ter sido fechado).',
    }
  }

  const sessao = mapearSessaoCaixaDoSupabase(data as CashSessionRow)

  await registrarAuditLog({
    officeUuid,
    cashSessionId: sessao.id,
    action: 'cash_session_closed',
    actorId: closedBy,
    actorName: params.closedByName,
    payload: {
      opening_balance: sessao.opening_balance,
      expected_balance: expected,
      closing_balance_informed: closing,
      difference,
      notes: sessao.notes,
    },
  })

  return { ok: true, dados: sessao }
}

export async function listarAuditoriaCaixaRemoto(
  officeId: string,
  cashSessionId?: string,
  limite = 50
): Promise<ResultadoCaixa<AuditoriaCaixa[]>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: 'Cliente Supabase indisponível' }

  const officeUuid = await resolverOfficeUuid(officeId)
  if (!officeUuid) return { ok: false, erro: 'Sem office_id no perfil' }

  let query = supabase
    .from('cash_audit_logs')
    .select('*')
    .eq('office_id', officeUuid)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limite, 1), 200))

  if (cashSessionId?.trim()) {
    query = query.eq('cash_session_id', cashSessionId.trim())
  }

  const { data, error } = await query
  if (error) {
    return {
      ok: false,
      erro: mensagemTabelaAusente(error.message) ?? error.message,
    }
  }

  return {
    ok: true,
    dados: ((data ?? []) as CashAuditLogRow[]).map(mapearAuditoriaCaixaDoSupabase),
  }
}

async function obterSessaoPorId(
  officeUuid: string,
  sessionId: string
): Promise<ResultadoCaixa<SessaoCaixa>> {
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: 'Cliente Supabase indisponível' }

  const { data, error } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('office_id', officeUuid)
    .eq('id', sessionId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    return { ok: false, erro: mensagemTabelaAusente(error.message) ?? error.message }
  }
  if (!data) return { ok: false, erro: 'Sessão de caixa não encontrada.' }
  return { ok: true, dados: mapearSessaoCaixaDoSupabase(data as CashSessionRow) }
}

export async function obterSessaoCaixaRemoto(
  officeId: string,
  sessionId: string
): Promise<ResultadoCaixa<SessaoCaixa>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }
  const officeUuid = await resolverOfficeUuid(officeId)
  if (!officeUuid) return { ok: false, erro: 'Sem office_id no perfil' }

  const id = sessionId.trim()
  if (!id || !isUuidFormato(id)) {
    return { ok: false, erro: 'Sessão de caixa inválida.' }
  }
  return obterSessaoPorId(officeUuid, id)
}

export async function listarMovimentosCaixaRemoto(
  officeId: string,
  cashSessionId: string
): Promise<ResultadoCaixa<MovimentoCaixa[]>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: 'Cliente Supabase indisponível' }

  const officeUuid = await resolverOfficeUuid(officeId)
  if (!officeUuid) return { ok: false, erro: 'Sem office_id no perfil' }

  const sessionId = cashSessionId.trim()
  if (!sessionId || !isUuidFormato(sessionId)) {
    return { ok: false, erro: 'Sessão de caixa inválida.' }
  }

  const { data, error } = await supabase
    .from('cash_movements')
    .select('*')
    .eq('office_id', officeUuid)
    .eq('cash_session_id', sessionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    return {
      ok: false,
      erro: mensagemTabelaAusente(error.message) ?? error.message,
    }
  }

  return {
    ok: true,
    dados: ((data ?? []) as CashMovementRow[]).map(mapearMovimentoCaixaDoSupabase),
  }
}

/**
 * Cria movimento na sessão.
 * Não atualiza cash_sessions.expected_balance (cálculo via calcularResumoCaixa).
 * Não exige nem cria vínculo com pagamento de OS.
 */
export async function criarMovimentoCaixaRemoto(
  params: CriarMovimentoCaixaParams
): Promise<ResultadoCaixa<MovimentoCaixa>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: 'Cliente Supabase indisponível' }

  const officeUuid = await resolverOfficeUuid(params.officeId)
  if (!officeUuid) return { ok: false, erro: 'Sem office_id no perfil' }

  const sessionId = params.cashSessionId.trim()
  if (!sessionId || !isUuidFormato(sessionId)) {
    return { ok: false, erro: 'Sessão de caixa inválida.' }
  }

  if (!TIPOS_MOVIMENTO_VALIDOS.includes(params.type)) {
    return { ok: false, erro: 'Tipo de movimento inválido.' }
  }

  const amount = Number(params.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, erro: 'Valor do movimento inválido.' }
  }

  const sessao = await obterSessaoPorId(officeUuid, sessionId)
  if (!sessao.ok || !sessao.dados) {
    return { ok: false, erro: sessao.erro ?? 'Sessão de caixa não encontrada.' }
  }
  if (sessao.dados.status !== 'open') {
    return { ok: false, erro: 'Só é possível lançar movimentos em caixa aberto.' }
  }

  const linha = {
    office_id: officeUuid,
    cash_session_id: sessionId,
    type: params.type,
    amount,
    payment_method: params.paymentMethod?.trim() || null,
    reason: params.reason?.trim() || null,
    notes: params.notes?.trim() || null,
    created_by: uuidOpcional(params.createdBy),
    created_by_name: params.createdByName?.trim() || null,
    authorized_by: uuidOpcional(params.authorizedBy),
    authorized_by_name: params.authorizedByName?.trim() || null,
    authorized_by_pin: Boolean(params.authorizedByPin),
    service_order_payment_id: uuidOpcional(params.serviceOrderPaymentId),
    financial_transaction_id: uuidOpcional(params.financialTransactionId),
    local_lancamento_id: params.localLancamentoId?.trim() || null,
    craft_meta: params.craftMeta ?? { fase: '2A' },
  }

  const { data, error } = await supabase
    .from('cash_movements')
    .insert(linha as never)
    .select('*')
    .maybeSingle()

  if (error || !data) {
    const msg = error?.message ?? ''
    // Corrida: índice único sale×pagamento — tratar como sucesso idempotente
    if (
      params.type === 'sale' &&
      params.serviceOrderPaymentId &&
      (msg.toLowerCase().includes('cash_movements_unique_active_sale_payment') ||
        msg.toLowerCase().includes('duplicate key') ||
        msg.toLowerCase().includes('unique constraint'))
    ) {
      const existente = await buscarSaleAtivoPorPagamentoRemoto(params.officeId, {
        serviceOrderPaymentId: params.serviceOrderPaymentId,
        clientPaymentId: params.localLancamentoId,
        localLancamentoId: params.localLancamentoId,
      })
      if (existente.ok && existente.dados) {
        return { ok: true, dados: existente.dados }
      }
    }
    return {
      ok: false,
      erro:
        mensagemTabelaAusente(msg) ??
        (msg.trim() || 'Não foi possível criar o movimento.'),
    }
  }

  const movimento = mapearMovimentoCaixaDoSupabase(data as CashMovementRow)

  await registrarAuditLog({
    officeUuid,
    cashSessionId: sessionId,
    action: 'cash_movement_created',
    actorId: uuidOpcional(params.createdBy),
    actorName: params.createdByName,
    payload: {
      movement_id: movimento.id,
      type: movimento.type,
      amount: movimento.amount,
      payment_method: movimento.payment_method,
      reason: movimento.reason,
      service_order_payment_id: movimento.service_order_payment_id,
    },
  })

  return { ok: true, dados: movimento }
}

/**
 * Busca sale ativo ligado a um pagamento OS (idempotência Fase 2C).
 */
export async function buscarSaleAtivoPorPagamentoRemoto(
  officeId: string,
  chaves: {
    serviceOrderPaymentId?: string | null
    clientPaymentId?: string | null
    localLancamentoId?: string | null
  }
): Promise<ResultadoCaixa<MovimentoCaixa | null>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: 'Cliente Supabase indisponível' }

  const officeUuid = await resolverOfficeUuid(officeId)
  if (!officeUuid) return { ok: false, erro: 'Sem office_id no perfil' }

  const sopId = chaves.serviceOrderPaymentId?.trim()
  if (sopId && isUuidFormato(sopId)) {
    const { data, error } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('office_id', officeUuid)
      .eq('type', 'sale')
      .eq('service_order_payment_id', sopId)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (error) {
      return {
        ok: false,
        erro: mensagemTabelaAusente(error.message) ?? error.message,
      }
    }
    if (data) {
      return { ok: true, dados: mapearMovimentoCaixaDoSupabase(data as CashMovementRow) }
    }
  }

  const localId =
    chaves.clientPaymentId?.trim() || chaves.localLancamentoId?.trim() || ''
  if (localId) {
    const { data, error } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('office_id', officeUuid)
      .eq('type', 'sale')
      .eq('local_lancamento_id', localId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return {
        ok: false,
        erro: mensagemTabelaAusente(error.message) ?? error.message,
      }
    }
    if (data) {
      return { ok: true, dados: mapearMovimentoCaixaDoSupabase(data as CashMovementRow) }
    }

    // Fallback: craft_meta.client_payment_id (PostgREST filter)
    const { data: porMeta, error: erroMeta } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('office_id', officeUuid)
      .eq('type', 'sale')
      .is('deleted_at', null)
      .contains('craft_meta', { client_payment_id: localId })
      .limit(1)
      .maybeSingle()

    if (!erroMeta && porMeta) {
      return {
        ok: true,
        dados: mapearMovimentoCaixaDoSupabase(porMeta as CashMovementRow),
      }
    }
  }

  return { ok: true, dados: null }
}

/** Soft delete (deleted_at) + audit. Não remove fisicamente. */
export async function cancelarMovimentoCaixaRemoto(
  params: CancelarMovimentoCaixaParams
): Promise<ResultadoCaixa<MovimentoCaixa>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: 'Cliente Supabase indisponível' }

  const officeUuid = await resolverOfficeUuid(params.officeId)
  if (!officeUuid) return { ok: false, erro: 'Sem office_id no perfil' }

  const movementId = params.movementId.trim()
  if (!movementId || !isUuidFormato(movementId)) {
    return { ok: false, erro: 'Movimento inválido.' }
  }

  const { data: atual, error: erroBusca } = await supabase
    .from('cash_movements')
    .select('*')
    .eq('office_id', officeUuid)
    .eq('id', movementId)
    .is('deleted_at', null)
    .maybeSingle()

  if (erroBusca) {
    return {
      ok: false,
      erro: mensagemTabelaAusente(erroBusca.message) ?? erroBusca.message,
    }
  }
  if (!atual) {
    return { ok: false, erro: 'Movimento não encontrado.' }
  }

  const movAtual = mapearMovimentoCaixaDoSupabase(atual as CashMovementRow)
  const agora = new Date().toISOString()
  const meta = {
    ...movAtual.craft_meta,
    cancelled_at: agora,
    cancelled_by: uuidOpcional(params.cancelledBy),
    cancelled_by_name: params.cancelledByName?.trim() || null,
    cancel_reason: params.reason?.trim() || null,
  }

  const { data, error } = await supabase
    .from('cash_movements')
    .update({
      deleted_at: agora,
      craft_meta: meta,
    } as never)
    .eq('office_id', officeUuid)
    .eq('id', movementId)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle()

  if (error) {
    return { ok: false, erro: mensagemTabelaAusente(error.message) ?? error.message }
  }
  if (!data) {
    return { ok: false, erro: 'Não foi possível cancelar o movimento.' }
  }

  const movimento = mapearMovimentoCaixaDoSupabase(data as CashMovementRow)

  await registrarAuditLog({
    officeUuid,
    cashSessionId: movimento.cash_session_id,
    action: 'cash_movement_cancelled',
    actorId: uuidOpcional(params.cancelledBy),
    actorName: params.cancelledByName,
    payload: {
      movement_id: movimento.id,
      type: movimento.type,
      amount: movimento.amount,
      reason: params.reason?.trim() || null,
    },
  })

  return { ok: true, dados: movimento }
}
