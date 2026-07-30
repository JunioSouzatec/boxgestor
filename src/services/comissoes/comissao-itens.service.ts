/**
 * RC2 Comissão Fase B1 — services base (itens por OS + saldo).
 * Não liga na UI principal nesta fase. Não remove o fluxo antigo.
 */
import { getSupabaseClient, isSupabaseConfigured, getCraftPersistenceMode } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { aguardarSessaoAuthSupabase } from '@/lib/supabase-session-ready'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import {
  dataReferenciaOsComissao,
  listarOsComissaoFuncionario,
  osElegivelParaComissao,
  osPertenceFuncionario,
} from '@/services/comissoes/comissoes.service'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'
import type {
  ComissoesConfigOficina,
  PagamentoComissaoFolha,
  PerfilComissaoFuncionario,
} from '@/types/comissoes'
import type {
  ComissaoItem,
  DiagnosticoBackfillComissaoItem,
  SaldoComissaoFuncionario,
  StatusComissaoItem,
} from '@/types/comissao-itens'
import { tipoUsaMaoObra, tipoUsaPecas } from '@/types/comissoes'

export function comissaoItensDisponivel(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100
}

export function derivarStatusComissaoItem(
  commissionAmount: number,
  paidAmount: number,
  forcarCancelado = false
): StatusComissaoItem {
  if (forcarCancelado) return 'cancelado'
  const comissao = arredondar2(Math.max(0, commissionAmount))
  const pago = arredondar2(Math.max(0, paidAmount))
  if (comissao <= 0 && pago <= 0) return 'cancelado'
  if (pago <= 0) return 'em_aberto'
  if (pago + 0.009 >= comissao) return 'pago'
  return 'parcial'
}

export function calcularOpenAmount(commissionAmount: number, paidAmount: number): number {
  return arredondar2(Math.max(0, commissionAmount - paidAmount))
}

async function resolverOfficeUuid(officeIdLocal: string): Promise<string | null> {
  const contexto = await obterContextoOfficeSupabase(officeIdLocal)
  return contexto?.officeUuid ?? null
}

function tabelaInexistente(mensagem: string): boolean {
  const msg = mensagem.toLowerCase()
  return msg.includes('does not exist') || msg.includes('relation')
}

interface ItemRow {
  id: string
  office_id: string
  employee_id: string
  employee_name: string | null
  service_order_id: string
  service_order_number: string | null
  customer_name: string | null
  vehicle_label: string | null
  competence_month: string
  reference_date: string | null
  base_labor: number | null
  base_parts: number | null
  commission_type: string | null
  labor_percent: number | null
  parts_percent: number | null
  commission_amount: number | null
  paid_amount: number | null
  open_amount: number | null
  status: string
  source_snapshot: Record<string, unknown> | null
  adjustment_of_item_id: string | null
  adjustment_reason: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function mapearItem(row: ItemRow, officeIdLocal: string): ComissaoItem {
  const commission = Number(row.commission_amount ?? 0)
  const paid = Number(row.paid_amount ?? 0)
  return {
    id: row.id,
    office_id: officeIdLocal,
    employee_id: row.employee_id,
    employee_name: row.employee_name?.trim() || 'Funcionário',
    service_order_id: row.service_order_id,
    service_order_number: row.service_order_number ?? undefined,
    customer_name: row.customer_name ?? undefined,
    vehicle_label: row.vehicle_label ?? undefined,
    competence_month: row.competence_month,
    reference_date: row.reference_date ?? undefined,
    base_labor: Number(row.base_labor ?? 0),
    base_parts: Number(row.base_parts ?? 0),
    commission_type: row.commission_type ?? undefined,
    labor_percent: Number(row.labor_percent ?? 0),
    parts_percent: Number(row.parts_percent ?? 0),
    commission_amount: commission,
    paid_amount: paid,
    open_amount: Number(row.open_amount ?? calcularOpenAmount(commission, paid)),
    status: (row.status as StatusComissaoItem) || derivarStatusComissaoItem(commission, paid),
    source_snapshot: row.source_snapshot ?? undefined,
    adjustment_of_item_id: row.adjustment_of_item_id ?? undefined,
    adjustment_reason: row.adjustment_reason ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? undefined,
  }
}

export interface GerarItemComissaoDaOsInput {
  officeIdLocal: string
  perfil: PerfilComissaoFuncionario
  os: OrdemServico
  lancamentos: LancamentoFinanceiro[]
  config: ComissoesConfigOficina
  customerName?: string
  vehicleLabel?: string
}

/**
 * Gera ou atualiza o item principal de comissão da OS (não ajuste).
 * Não altera paid_amount já baixado — só recalcula commission/open/status
 * quando o item ainda não está totalmente pago (salvo cancelamento).
 */
export async function gerarOuAtualizarItemComissaoDaOs(
  input: GerarItemComissaoDaOsInput
): Promise<{ ok: boolean; item?: ComissaoItem; erro?: string; skipped?: boolean }> {
  if (!comissaoItensDisponivel()) {
    return { ok: false, erro: 'Recurso disponível apenas com sincronização online (Supabase).' }
  }

  const sessao = await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
  if (!sessao) return { ok: false, erro: 'Sem sessão autenticada.' }

  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: 'Cliente Supabase indisponível.' }

  const officeUuid = await resolverOfficeUuid(input.officeIdLocal)
  if (!officeUuid) return { ok: false, erro: 'Não foi possível resolver a oficina.' }

  if (!osPertenceFuncionario(input.os, input.perfil)) {
    return { ok: true, skipped: true }
  }

  const cancelada = input.os.status === 'cancelada'
  const elegivel =
    !cancelada && osElegivelParaComissao(input.os, input.lancamentos, input.config.criterio_os)

  const detalhes = listarOsComissaoFuncionario(
    input.perfil,
    [input.os],
    input.lancamentos,
    dataReferenciaOsComissao(input.os).slice(0, 7) || input.os.criado_em?.slice(0, 7) || '',
    input.config
  )
  const detalhe = detalhes[0]
  const snap = input.os.comissao_snapshot
  const commissionAmount = elegivel ? arredondar2(detalhe?.comissao ?? 0) : 0
  const refDate = dataReferenciaOsComissao(input.os) || undefined
  const competence = (refDate ?? '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(competence)) {
    return { ok: false, erro: 'Competência inválida para a OS.' }
  }

  const { data: existente, error: erroBusca } = await supabase
    .from('employee_commission_items')
    .select('*')
    .eq('office_id', officeUuid)
    .eq('employee_id', input.perfil.id)
    .eq('service_order_id', input.os.id)
    .is('adjustment_of_item_id', null)
    .is('deleted_at', null)
    .maybeSingle()

  if (erroBusca) {
    if (tabelaInexistente(erroBusca.message)) {
      return {
        ok: false,
        erro: 'Tabela employee_commission_items não encontrada. Aplique a migration 20260730180000.',
      }
    }
    registrarUltimoErroSupabase({ mensagem: erroBusca.message, entidade: 'comissao_itens' })
    return { ok: false, erro: erroBusca.message }
  }

  const paidAnterior = Number((existente as ItemRow | null)?.paid_amount ?? 0)
  const status = cancelada
    ? 'cancelado'
    : derivarStatusComissaoItem(commissionAmount, paidAnterior)
  const openAmount = cancelada ? 0 : calcularOpenAmount(commissionAmount, paidAnterior)
  const agora = new Date().toISOString()

  const payload = {
    office_id: officeUuid,
    employee_id: input.perfil.id,
    employee_name: input.perfil.nome,
    service_order_id: input.os.id,
    service_order_number: String(input.os.numero ?? ''),
    customer_name: input.customerName?.trim() || null,
    vehicle_label: input.vehicleLabel?.trim() || null,
    competence_month: competence,
    reference_date: refDate || null,
    base_labor: arredondar2(detalhe?.mao_obra ?? input.os.valor_mao_obra ?? 0),
    base_parts: arredondar2(detalhe?.pecas ?? input.os.valor_pecas ?? 0),
    commission_type: detalhe?.tipo_comissao ?? input.perfil.tipo_comissao,
    labor_percent: tipoUsaMaoObra(input.perfil.tipo_comissao)
      ? Number(snap?.percentual_mao_obra ?? input.perfil.percentual_comissao ?? 0)
      : 0,
    parts_percent: tipoUsaPecas(input.perfil.tipo_comissao)
      ? Number(snap?.percentual_pecas ?? input.perfil.percentual_comissao_pecas ?? 0)
      : 0,
    commission_amount: commissionAmount,
    paid_amount: paidAnterior,
    open_amount: openAmount,
    status,
    source_snapshot: (snap as unknown as Record<string, unknown>) ?? {},
    updated_at: agora,
  }

  if (existente) {
    // Item já pago: não recalcula commission_amount sozinho (ajustes = fase futura)
    const rowExist = existente as ItemRow
    if (rowExist.status === 'pago' && !cancelada && Math.abs(commissionAmount - Number(rowExist.commission_amount)) > 0.009) {
      return { ok: true, item: mapearItem(rowExist, input.officeIdLocal), skipped: true }
    }

    const { data, error } = await supabase
      .from('employee_commission_items')
      .update(payload as never)
      .eq('id', rowExist.id)
      .eq('office_id', officeUuid)
      .select('*')
      .maybeSingle()

    if (error) {
      registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'comissao_itens' })
      return { ok: false, erro: error.message }
    }
    return {
      ok: true,
      item: data ? mapearItem(data as ItemRow, input.officeIdLocal) : undefined,
    }
  }

  if (!elegivel && commissionAmount <= 0) {
    return { ok: true, skipped: true }
  }

  const { data, error } = await supabase
    .from('employee_commission_items')
    .insert({ ...payload, created_at: agora } as never)
    .select('*')
    .maybeSingle()

  if (error) {
    registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'comissao_itens' })
    return { ok: false, erro: error.message }
  }

  return {
    ok: true,
    item: data ? mapearItem(data as ItemRow, input.officeIdLocal) : undefined,
  }
}

export async function listarItensComissaoFuncionario(
  officeIdLocal: string,
  employeeId: string,
  opts?: { competenceMonth?: string; apenasAbertos?: boolean }
): Promise<ComissaoItem[]> {
  if (!comissaoItensDisponivel()) return []
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) return []

  let q = supabase
    .from('employee_commission_items')
    .select('*')
    .eq('office_id', officeUuid)
    .eq('employee_id', employeeId)
    .is('deleted_at', null)
    .order('reference_date', { ascending: true })

  if (opts?.competenceMonth) q = q.eq('competence_month', opts.competenceMonth)
  if (opts?.apenasAbertos) q = q.in('status', ['em_aberto', 'parcial'])

  const { data, error } = await q
  if (error) {
    if (tabelaInexistente(error.message)) return []
    registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'comissao_itens' })
    return []
  }
  return (data ?? []).map((row) => mapearItem(row as ItemRow, officeIdLocal))
}

export async function listarSaldoComissaoFuncionario(
  officeIdLocal: string,
  employeeId: string,
  competenceMonth?: string
): Promise<SaldoComissaoFuncionario | null> {
  const itens = await listarItensComissaoFuncionario(officeIdLocal, employeeId, {
    competenceMonth,
  })
  if (itens.length === 0) {
    return {
      employee_id: employeeId,
      employee_name: '',
      competence_month: competenceMonth,
      total_gerado: 0,
      total_pago: 0,
      saldo_em_aberto: 0,
      qtd_itens_abertos: 0,
      qtd_itens_pagos: 0,
      qtd_itens_parciais: 0,
    }
  }

  const ativos = itens.filter((i) => i.status !== 'cancelado')
  const totalGerado = arredondar2(ativos.reduce((a, i) => a + i.commission_amount, 0))
  const totalPago = arredondar2(ativos.reduce((a, i) => a + i.paid_amount, 0))
  const saldo = arredondar2(ativos.reduce((a, i) => a + i.open_amount, 0))

  return {
    employee_id: employeeId,
    employee_name: itens[0]?.employee_name ?? '',
    competence_month: competenceMonth,
    total_gerado: totalGerado,
    total_pago: totalPago,
    saldo_em_aberto: saldo,
    qtd_itens_abertos: ativos.filter((i) => i.status === 'em_aberto').length,
    qtd_itens_pagos: ativos.filter((i) => i.status === 'pago').length,
    qtd_itens_parciais: ativos.filter((i) => i.status === 'parcial').length,
  }
}

/**
 * Diagnóstico de backfill — NÃO grava nada.
 * Simula itens a partir das OS elegíveis e compara com baixas antigas do mês.
 */
export function diagnosticarBackfillComissaoItens(params: {
  perfis: PerfilComissaoFuncionario[]
  ordens: OrdemServico[]
  lancamentos: LancamentoFinanceiro[]
  config: ComissoesConfigOficina
  pagamentosAntigos: PagamentoComissaoFolha[]
  competenceMonth: string
}): DiagnosticoBackfillComissaoItem[] {
  const { perfis, ordens, lancamentos, config, pagamentosAntigos, competenceMonth } = params
  const resultado: DiagnosticoBackfillComissaoItem[] = []

  for (const perfil of perfis) {
    const detalhes = listarOsComissaoFuncionario(
      perfil,
      ordens,
      lancamentos,
      competenceMonth,
      config
    )
    const totalItens = arredondar2(detalhes.reduce((a, d) => a + d.comissao, 0))
    const baixa = pagamentosAntigos.find(
      (p) =>
        p.employee_local_id === perfil.id &&
        p.competence_month === competenceMonth &&
        !p.canceled_at
    )
    const baixaValor = baixa ? Number(baixa.commission_amount) : null
    resultado.push({
      employee_id: perfil.id,
      employee_name: perfil.nome,
      competence_month: competenceMonth,
      itens_simulados: detalhes.length,
      total_itens_simulados: totalItens,
      baixa_antiga_commission_amount: baixaValor,
      diferenca: baixaValor == null ? null : arredondar2(totalItens - baixaValor),
      os_ids: detalhes.map((d) => d.os_id),
    })
  }

  return resultado.sort((a, b) => a.employee_name.localeCompare(b.employee_name, 'pt-BR'))
}
