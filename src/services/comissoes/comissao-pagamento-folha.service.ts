import { getSupabaseClient, isSupabaseConfigured, getCraftPersistenceMode } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { aguardarSessaoAuthSupabase } from '@/lib/supabase-session-ready'
import { localIdParaUuid } from '@/lib/local-id-uuid'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import type {
  CorrecaoBaixaComissao,
  CorrigirPagamentoComissaoInput,
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
  const notes = row.notes?.trim() || undefined
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
    notes,
    canceled_at: row.canceled_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ultima_correcao: extrairUltimaCorrecaoBaixa(notes),
  }
}

const MARCA_CORRECAO_INI = '--- CORRECAO_BAIXA ---'
const MARCA_CORRECAO_FIM = '--- FIM_CORRECAO_BAIXA ---'

function formatarValorAudit(valor: number): string {
  return (Math.round(valor * 100) / 100).toFixed(2)
}

/** Extrai a última correção gravada em notes (sem migration / sem metadata). */
export function extrairUltimaCorrecaoBaixa(notes?: string | null): CorrecaoBaixaComissao | undefined {
  if (!notes?.includes(MARCA_CORRECAO_INI)) return undefined
  const blocos = notes.split(MARCA_CORRECAO_INI).slice(1)
  const ultimo = blocos[blocos.length - 1]
  if (!ultimo) return undefined
  const corpo = ultimo.split(MARCA_CORRECAO_FIM)[0] ?? ultimo
  const ler = (chave: string): string => {
    const m = new RegExp(`^${chave}:\\s*(.*)$`, 'im').exec(corpo)
    return m?.[1]?.trim() ?? ''
  }
  const valorAnterior = Number(ler('valor_anterior').replace(',', '.'))
  const novoValor = Number(ler('novo_valor').replace(',', '.'))
  if (!Number.isFinite(valorAnterior) || !Number.isFinite(novoValor)) return undefined
  return {
    valor_anterior: valorAnterior,
    novo_valor: novoValor,
    forma_pagamento: ler('forma') || 'outro',
    motivo: ler('motivo'),
    corrigido_por: ler('corrigido_por') || '—',
    corrigido_em: ler('corrigido_em') || '',
  }
}

function anexarCorrecaoEmNotes(
  notesAtuais: string | null | undefined,
  correcao: CorrecaoBaixaComissao
): string {
  const bloco = [
    MARCA_CORRECAO_INI,
    `valor_anterior: ${formatarValorAudit(correcao.valor_anterior)}`,
    `novo_valor: ${formatarValorAudit(correcao.novo_valor)}`,
    `forma: ${correcao.forma_pagamento}`,
    `motivo: ${correcao.motivo.replace(/\r?\n/g, ' ').trim()}`,
    `corrigido_por: ${correcao.corrigido_por}`,
    `corrigido_em: ${correcao.corrigido_em}`,
    MARCA_CORRECAO_FIM,
  ].join('\n')
  const base = (notesAtuais ?? '').trim()
  return base ? `${base}\n\n${bloco}` : bloco
}

export interface ResultadoCorrecaoPagamentoComissao {
  ok: boolean
  pagamento?: PagamentoComissaoFolha
  erro?: string
}

/**
 * Corrige commission_amount de uma baixa existente (UPDATE, sem apagar, sem duplicar).
 * Histórico da correção vai em notes (campo já existente — sem migration).
 */
export async function corrigirPagamentoComissao(
  officeIdLocal: string,
  input: CorrigirPagamentoComissaoInput,
  usuario?: { id?: string; nome?: string }
): Promise<ResultadoCorrecaoPagamentoComissao> {
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

  const novoValor = Math.max(0, Number(input.novo_commission_amount))
  const motivo = input.motivo.trim()
  const forma = input.forma_pagamento.trim() || 'outro'
  if (!motivo) {
    return { ok: false, erro: 'Informe o motivo da correção.' }
  }
  if (!Number.isFinite(novoValor)) {
    return { ok: false, erro: 'Valor inválido.' }
  }

  const { data: atual, error: erroBusca } = await supabase
    .from('employee_commission_payments')
    .select('*')
    .eq('id', input.pagamento_id)
    .eq('office_id', officeUuid)
    .is('canceled_at', null)
    .maybeSingle()

  if (erroBusca) {
    registrarUltimoErroSupabase({ mensagem: erroBusca.message, entidade: 'comissao_pagamento_folha' })
    return { ok: false, erro: erroBusca.message }
  }
  if (!atual) {
    return { ok: false, erro: 'Baixa de comissão não encontrada.' }
  }

  const rowAtual = atual as EmployeeCommissionPaymentRow
  const valorAnterior = Number(rowAtual.commission_amount ?? 0)
  const salario = Number(rowAtual.salary_amount ?? 0)
  const agora = new Date().toISOString()
  const correcao: CorrecaoBaixaComissao = {
    valor_anterior: valorAnterior,
    novo_valor: novoValor,
    forma_pagamento: forma,
    motivo,
    corrigido_por: usuario?.nome?.trim() || 'Usuário',
    corrigido_em: agora,
  }
  const notes = anexarCorrecaoEmNotes(rowAtual.notes, correcao)

  const { data, error } = await supabase
    .from('employee_commission_payments')
    .update({
      commission_amount: novoValor,
      total_amount: Math.max(0, salario) + novoValor,
      notes,
      updated_at: agora,
    } as never)
    .eq('id', input.pagamento_id)
    .eq('office_id', officeUuid)
    .is('canceled_at', null)
    .select('*')
    .maybeSingle()

  if (error) {
    registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'comissao_pagamento_folha' })
    return { ok: false, erro: error.message }
  }

  return {
    ok: true,
    pagamento: data ? mapearLinha(data as EmployeeCommissionPaymentRow, officeIdLocal) : undefined,
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
  if (pagamento.commission_amount > comissaoAtual + TOLERANCIA_VALOR) {
    return 'pago_com_ajuste'
  }
  return 'pago'
}

/** Diferença ainda não baixada (>= 0) quando o calculado supera o registrado. */
export function diferencaComissaoPendente(
  comissaoAtual: number,
  pagamento?: PagamentoComissaoFolha | null
): number {
  if (!pagamento) return comissaoAtual
  return Math.max(0, comissaoAtual - pagamento.commission_amount)
}

/**
 * Diferença folha − calculado (com sinal).
 * Positivo = registrado em folha maior que o previsto atual.
 * Negativo = ainda falta baixar.
 */
export function diferencaComissaoFolhaAssinada(
  comissaoAtual: number,
  pagamento?: PagamentoComissaoFolha | null
): number {
  if (!pagamento) return -comissaoAtual
  return Math.round((pagamento.commission_amount - comissaoAtual) * 100) / 100
}

export function labelStatusComissaoFolha(status: StatusComissaoFolha): string {
  switch (status) {
    case 'pago':
      return 'Pago'
    case 'pago_com_ajuste':
      return 'Pago com ajuste'
    case 'diferenca_pendente':
      return 'Diferença pendente'
    default:
      return 'Pendente'
  }
}
