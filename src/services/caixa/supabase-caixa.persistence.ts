/**
 * Persistência remota do Caixa (Fase 1A).
 * Não vincula pagamentos de OS. Não cria movimentos.
 */

import { isUuidFormato } from '@/lib/local-id-uuid'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import {
  mapearAuditoriaCaixaDoSupabase,
  mapearSessaoCaixaDoSupabase,
  type CashAuditLogRow,
  type CashSessionRow,
} from '@/services/caixa/caixa-mappers'
import type {
  AbrirCaixaParams,
  AuditoriaCaixa,
  FecharCaixaParams,
  ListarSessoesCaixaFiltros,
  ResultadoCaixa,
  SessaoCaixa,
} from '@/types/caixa'

async function resolverOfficeUuid(officeId: string): Promise<string | null> {
  const ctx = await obterContextoOfficeSupabase(officeId)
  return ctx?.officeUuid ?? null
}

function mensagemTabelaAusente(erro: string): string | null {
  const msg = erro.toLowerCase()
  if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache')) {
    return 'Tabelas de caixa ainda não existem no Supabase. Aplique a migration cash_sessions_base.'
  }
  return null
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

  // Fase 1A: expected = opening_balance (sem movimentos)
  const expected = sessaoAtual.opening_balance
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
