import { getSupabaseClient, isSupabaseConfigured, getCraftPersistenceMode } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { aguardarSessaoAuthSupabase } from '@/lib/supabase-session-ready'
import { localIdParaUuid } from '@/lib/local-id-uuid'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import type {
  PagamentoComissaoFolha,
  RegistrarPagamentoComissaoInput,
  StatusComissaoFolha,
} from '@/types/comissoes'

/** Tolerância para comparação de valores em reais (evita ruído de arredondamento). */
const TOLERANCIA_VALOR = 0.01

interface EmployeeCommissionPaymentRow {
  id: string
  office_id: string
  local_id: string | null
  employee_id: string | null
  employee_local_id: string
  employee_name: string | null
  competence_month: string
  salary_amount: number | null
  commission_amount: number | null
  total_amount: number | null
  paid_at: string
  paid_by_user_id: string | null
  paid_by_name: string | null
  notes: string | null
  canceled_at: string | null
  created_at: string
  updated_at: string
}

export interface ResultadoRegistroPagamentoComissao {
  ok: boolean
  duplicado?: boolean
  pagamento?: PagamentoComissaoFolha
  erro?: string
}

/** true quando a persistência de baixa de comissão está disponível (Supabase online). */
export function pagamentoComissaoDisponivel(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

function mapearLinha(row: EmployeeCommissionPaymentRow, officeIdLocal: string): PagamentoComissaoFolha {
  return {
    id: row.id,
    office_id: officeIdLocal,
    employee_local_id: row.employee_local_id,
    employee_name: row.employee_name?.trim() || 'Funcionário',
    competence_month: row.competence_month,
    salary_amount: Number(row.salary_amount ?? 0),
    commission_amount: Number(row.commission_amount ?? 0),
    total_amount: Number(row.total_amount ?? 0),
    paid_at: row.paid_at,
    paid_by_user_id: row.paid_by_user_id ?? undefined,
    paid_by_name: row.paid_by_name?.trim() || undefined,
    notes: row.notes?.trim() || undefined,
    canceled_at: row.canceled_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function resolverOfficeUuid(officeIdLocal: string): Promise<string | null> {
  const contexto = await obterContextoOfficeSupabase(officeIdLocal)
  return contexto?.officeUuid ?? null
}

function tabelaInexistente(mensagem: string): boolean {
  const msg = mensagem.toLowerCase()
  return msg.includes('does not exist') || msg.includes('relation')
}

/**
 * Carrega as baixas de comissão ATIVAS (não canceladas) da oficina.
 * Retorna lista vazia (sem erro) quando Supabase não está configurado ou a tabela
 * ainda não foi criada — o relatório continua funcionando normalmente.
 */
export async function carregarPagamentosComissao(
  officeIdLocal: string
): Promise<PagamentoComissaoFolha[]> {
  if (!pagamentoComissaoDisponivel()) return []

  const supabase = getSupabaseClient()
  if (!supabase) return []

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) return []

  const { data, error } = await supabase
    .from('employee_commission_payments')
    .select('*')
    .eq('office_id', officeUuid)
    .is('canceled_at', null)
    .order('competence_month', { ascending: false })

  if (error) {
    if (tabelaInexistente(error.message)) return []
    registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'comissao_pagamento_folha' })
    return []
  }

  return (data ?? []).map((row) => mapearLinha(row as EmployeeCommissionPaymentRow, officeIdLocal))
}

/**
 * Registra a baixa de comissão em folha (não paga automático, não cria caixa/despesa).
 * Idempotente: se já existir baixa ativa para o funcionário + competência, retorna
 * duplicado=true sem sobrescrever o pagamento anterior.
 */
export async function registrarPagamentoComissao(
  officeIdLocal: string,
  input: RegistrarPagamentoComissaoInput,
  usuario?: { id?: string; nome?: string }
): Promise<ResultadoRegistroPagamentoComissao> {
  if (!pagamentoComissaoDisponivel()) {
    return { ok: false, erro: 'Recurso disponível apenas com sincronização online (Supabase).' }
  }

  const sessao = await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
  if (!sessao) {
    return { ok: false, erro: 'Sem sessão autenticada.' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, erro: 'Cliente Supabase indisponível.' }
  }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return { ok: false, erro: 'Não foi possível resolver a oficina.' }
  }

  const competencia = input.competence_month.trim()
  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    return { ok: false, erro: 'Competência inválida.' }
  }

  // Não sobrescreve: se já existe baixa ativa para o mês, sinaliza duplicidade.
  const { data: existente, error: erroBusca } = await supabase
    .from('employee_commission_payments')
    .select('*')
    .eq('office_id', officeUuid)
    .eq('employee_local_id', input.perfil_id)
    .eq('competence_month', competencia)
    .is('canceled_at', null)
    .maybeSingle()

  if (erroBusca && !tabelaInexistente(erroBusca.message)) {
    registrarUltimoErroSupabase({ mensagem: erroBusca.message, entidade: 'comissao_pagamento_folha' })
    return { ok: false, erro: erroBusca.message }
  }
  if (existente) {
    return {
      ok: false,
      duplicado: true,
      pagamento: mapearLinha(existente as EmployeeCommissionPaymentRow, officeIdLocal),
    }
  }

  const localId = `comissao-pagamento:${input.perfil_id}:${competencia}`
  const employeeUuid = await localIdParaUuid(`perfil-comissao:${input.perfil_id}`)
  const paidByUuid = usuario?.id
    ? usuario.id.match(/^[0-9a-f-]{36}$/i)
      ? usuario.id
      : await localIdParaUuid(usuario.id)
    : null
  const agora = new Date().toISOString()

  const row = {
    office_id: officeUuid,
    local_id: localId,
    employee_id: employeeUuid,
    employee_local_id: input.perfil_id,
    employee_name: input.employee_name.trim(),
    competence_month: competencia,
    salary_amount: Math.max(0, input.salary_amount ?? 0),
    commission_amount: Math.max(0, input.commission_amount ?? 0),
    total_amount: Math.max(0, input.total_amount ?? 0),
    paid_at: agora,
    paid_by_user_id: paidByUuid,
    paid_by_name: usuario?.nome?.trim() || null,
    notes: input.notes?.trim() || null,
    created_at: agora,
    updated_at: agora,
  }

  const { data, error } = await supabase
    .from('employee_commission_payments')
    .upsert(row as never, { onConflict: 'office_id,local_id' })
    .select('*')
    .maybeSingle()

  if (error) {
    // Violação de índice único parcial (baixa concorrente já registrada).
    if (error.code === '23505') {
      const pago = await carregarPagamentoDoMes(officeIdLocal, input.perfil_id, competencia)
      return { ok: false, duplicado: true, pagamento: pago ?? undefined }
    }
    if (tabelaInexistente(error.message)) {
      return {
        ok: false,
        erro: 'Tabela employee_commission_payments não encontrada. Aplique a migration 20260720210000_employee_commission_payments.sql.',
      }
    }
    registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'comissao_pagamento_folha' })
    return { ok: false, erro: error.message }
  }

  return { ok: true, pagamento: data ? mapearLinha(data as EmployeeCommissionPaymentRow, officeIdLocal) : undefined }
}

async function carregarPagamentoDoMes(
  officeIdLocal: string,
  perfilId: string,
  competencia: string
): Promise<PagamentoComissaoFolha | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) return null
  const { data } = await supabase
    .from('employee_commission_payments')
    .select('*')
    .eq('office_id', officeUuid)
    .eq('employee_local_id', perfilId)
    .eq('competence_month', competencia)
    .is('canceled_at', null)
    .maybeSingle()
  return data ? mapearLinha(data as EmployeeCommissionPaymentRow, officeIdLocal) : null
}

/**
 * Deriva o status de baixa comparando a comissão calculada AGORA com o que já foi pago.
 * Nunca recalcula/sobrescreve: apenas classifica para exibição.
 */
export function derivarStatusComissaoFolha(
  comissaoAtual: number,
  pagamento?: PagamentoComissaoFolha | null
): StatusComissaoFolha {
  if (!pagamento) return 'pendente'
  if (comissaoAtual > pagamento.commission_amount + TOLERANCIA_VALOR) {
    return 'diferenca_pendente'
  }
  return 'pago'
}

/** Diferença ainda não baixada (>= 0). */
export function diferencaComissaoPendente(
  comissaoAtual: number,
  pagamento?: PagamentoComissaoFolha | null
): number {
  if (!pagamento) return comissaoAtual
  return Math.max(0, comissaoAtual - pagamento.commission_amount)
}
