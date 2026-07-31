/**
 * RC2 Comissão Fase B1 — baixas parciais (FIFO) sobre itens por OS.
 * Não liga na UI principal nesta fase. Não remove o fluxo antigo.
 */
import { getSupabaseClient, isSupabaseConfigured, getCraftPersistenceMode } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { aguardarSessaoAuthSupabase } from '@/lib/supabase-session-ready'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import {
  calcularOpenAmount,
  comissaoItensDisponivel,
  derivarStatusComissaoItem,
  listarItensComissaoFuncionario,
} from '@/services/comissoes/comissao-itens.service'
import type {
  ComissaoItem,
  ComissaoSettlement,
  CriarBaixaComissaoParcialInput,
  ResultadoBaixaComissaoParcial,
  StatusComissaoItem,
} from '@/types/comissao-itens'

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100
}

async function resolverOfficeUuid(officeIdLocal: string): Promise<string | null> {
  const contexto = await obterContextoOfficeSupabase(officeIdLocal)
  return contexto?.officeUuid ?? null
}

function tabelaInexistente(mensagem: string): boolean {
  const msg = mensagem.toLowerCase()
  return msg.includes('does not exist') || msg.includes('relation')
}

interface SettlementRow {
  id: string
  office_id: string
  employee_id: string
  employee_name: string | null
  competence_month: string | null
  amount_paid: number | null
  payment_method: string | null
  paid_at: string
  paid_by: string | null
  paid_by_name: string | null
  notes: string | null
  status: string
  correction_of_id: string | null
  correction_reason: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function mapearSettlement(row: SettlementRow, officeIdLocal: string): ComissaoSettlement {
  return {
    id: row.id,
    office_id: officeIdLocal,
    employee_id: row.employee_id,
    employee_name: row.employee_name?.trim() || 'Funcionário',
    competence_month: row.competence_month ?? undefined,
    amount_paid: Number(row.amount_paid ?? 0),
    payment_method: row.payment_method ?? undefined,
    paid_at: row.paid_at,
    paid_by: row.paid_by ?? undefined,
    paid_by_name: row.paid_by_name ?? undefined,
    notes: row.notes ?? undefined,
    status: (row.status as ComissaoSettlement['status']) || 'ativo',
    correction_of_id: row.correction_of_id ?? undefined,
    correction_reason: row.correction_reason ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? undefined,
  }
}

export function settlementsDisponivel(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

/**
 * Aloca valor em itens abertos (FIFO por reference_date / created_at).
 * Puro — não persiste; usado por criarBaixaComissaoParcial.
 */
export function aplicarBaixaEmItensAbertosFIFO(
  itensAbertos: ComissaoItem[],
  valorPagar: number
): {
  alocacoes: Array<{ item: ComissaoItem; amount_paid: number; status_apos: StatusComissaoItem }>
  excedente: number
} {
  let restante = arredondar2(Math.max(0, valorPagar))
  const ordenados = [...itensAbertos]
    .filter((i) => i.open_amount > 0.009 && (i.status === 'em_aberto' || i.status === 'parcial'))
    .sort((a, b) => {
      const da = a.reference_date || a.created_at
      const db = b.reference_date || b.created_at
      return da.localeCompare(db)
    })

  const alocacoes: Array<{
    item: ComissaoItem
    amount_paid: number
    status_apos: StatusComissaoItem
  }> = []

  for (const item of ordenados) {
    if (restante <= 0.009) break
    const aplicar = arredondar2(Math.min(item.open_amount, restante))
    if (aplicar <= 0) continue
    const novoPago = arredondar2(item.paid_amount + aplicar)
    const statusApos = derivarStatusComissaoItem(item.commission_amount, novoPago)
    alocacoes.push({ item, amount_paid: aplicar, status_apos: statusApos })
    restante = arredondar2(restante - aplicar)
  }

  return { alocacoes, excedente: Math.max(0, restante) }
}

export async function listarAlocacoesDaBaixa(
  officeIdLocal: string,
  settlementId: string
): Promise<Array<{ commission_item_id: string; amount_paid: number }>> {
  if (!settlementsDisponivel()) return []
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) return []

  const { data, error } = await supabase
    .from('employee_commission_settlement_items')
    .select('commission_item_id, amount_paid')
    .eq('office_id', officeUuid)
    .eq('settlement_id', settlementId)

  if (error) {
    if (tabelaInexistente(error.message)) return []
    registrarUltimoErroSupabase({
      mensagem: error.message,
      entidade: 'comissao_settlement_items',
    })
    return []
  }
  return (data ?? []).map((row) => ({
    commission_item_id: String((row as { commission_item_id: string }).commission_item_id),
    amount_paid: Number((row as { amount_paid: number }).amount_paid ?? 0),
  }))
}

export async function listarBaixasComissaoFuncionario(
  officeIdLocal: string,
  employeeId: string,
  opts?: { competenceMonth?: string }
): Promise<ComissaoSettlement[]> {
  if (!settlementsDisponivel()) return []
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) return []

  let q = supabase
    .from('employee_commission_settlements')
    .select('*')
    .eq('office_id', officeUuid)
    .eq('employee_id', employeeId)
    .is('deleted_at', null)
    .neq('status', 'cancelado')
    .order('paid_at', { ascending: false })

  if (opts?.competenceMonth) q = q.eq('competence_month', opts.competenceMonth)

  const { data, error } = await q
  if (error) {
    if (tabelaInexistente(error.message)) return []
    registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'comissao_settlements' })
    return []
  }
  return (data ?? []).map((row) => mapearSettlement(row as SettlementRow, officeIdLocal))
}

/**
 * Cria uma baixa parcial/total e aloca nos itens abertos (FIFO).
 * Permite várias baixas no mesmo mês. Excedente vai em notes (não some).
 */
export async function criarBaixaComissaoParcial(
  officeIdLocal: string,
  input: CriarBaixaComissaoParcialInput,
  usuario?: { id?: string; nome?: string }
): Promise<ResultadoBaixaComissaoParcial> {
  if (!comissaoItensDisponivel() || !settlementsDisponivel()) {
    return { ok: false, erro: 'Recurso disponível apenas com sincronização online (Supabase).' }
  }

  const valor = arredondar2(input.amount_paid)
  if (valor <= 0) return { ok: false, erro: 'Informe um valor pago maior que zero.' }

  const sessao = await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
  if (!sessao) return { ok: false, erro: 'Sem sessão autenticada.' }

  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: 'Cliente Supabase indisponível.' }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) return { ok: false, erro: 'Não foi possível resolver a oficina.' }

  const itens = await listarItensComissaoFuncionario(officeIdLocal, input.employee_id, {
    competenceMonth: input.competence_month,
    apenasAbertos: true,
  })

  const alvo = input.item_ids?.length
    ? input.item_ids
        .map((id) => itens.find((i) => i.id === id))
        .filter((i): i is ComissaoItem => Boolean(i))
    : itens

  const { alocacoes, excedente } = aplicarBaixaEmItensAbertosFIFO(alvo, valor)
  if (alocacoes.length === 0) {
    return { ok: false, erro: 'Não há itens em aberto para alocar este pagamento.' }
  }

  const agora = new Date().toISOString()
  const notesParts = [input.notes?.trim()].filter(Boolean) as string[]
  if (excedente > 0.009) {
    notesParts.push(
      `EXCEDENTE_NAO_ALOCADO: ${excedente.toFixed(2)} (sem item em aberto suficiente)`
    )
  }

  const paidByUuid =
    usuario?.id && /^[0-9a-f-]{36}$/i.test(usuario.id) ? usuario.id : null

  const { data: settlementRow, error: erroSettlement } = await supabase
    .from('employee_commission_settlements')
    .insert({
      office_id: officeUuid,
      employee_id: input.employee_id,
      employee_name: input.employee_name,
      competence_month: input.competence_month ?? null,
      amount_paid: valor,
      payment_method: input.payment_method ?? null,
      paid_at: agora,
      paid_by: paidByUuid,
      paid_by_name: usuario?.nome?.trim() || null,
      notes: notesParts.length ? notesParts.join('\n') : null,
      status: 'ativo',
      created_at: agora,
      updated_at: agora,
    } as never)
    .select('*')
    .maybeSingle()

  if (erroSettlement) {
    if (tabelaInexistente(erroSettlement.message)) {
      return {
        ok: false,
        erro: 'Tabela employee_commission_settlements não encontrada. Aplique a migration 20260730180000.',
      }
    }
    registrarUltimoErroSupabase({
      mensagem: erroSettlement.message,
      entidade: 'comissao_settlements',
    })
    return { ok: false, erro: erroSettlement.message }
  }

  if (!settlementRow) {
    return { ok: false, erro: 'Baixa não retornou registro após insert.' }
  }

  const settlement = mapearSettlement(settlementRow as SettlementRow, officeIdLocal)
  const alocacoesResult: ResultadoBaixaComissaoParcial['alocacoes'] = []

  for (const aloc of alocacoes) {
    const novoPago = arredondar2(aloc.item.paid_amount + aloc.amount_paid)
    const open = calcularOpenAmount(aloc.item.commission_amount, novoPago)

    const { error: erroItem } = await supabase
      .from('employee_commission_items')
      .update({
        paid_amount: novoPago,
        open_amount: open,
        status: aloc.status_apos,
        updated_at: agora,
      } as never)
      .eq('id', aloc.item.id)
      .eq('office_id', officeUuid)

    if (erroItem) {
      registrarUltimoErroSupabase({ mensagem: erroItem.message, entidade: 'comissao_itens' })
      return {
        ok: false,
        erro: `Baixa criada, mas falhou ao atualizar item ${aloc.item.id}: ${erroItem.message}`,
        settlement,
      }
    }

    const { error: erroLink } = await supabase.from('employee_commission_settlement_items').insert({
      office_id: officeUuid,
      settlement_id: settlement.id,
      commission_item_id: aloc.item.id,
      amount_paid: aloc.amount_paid,
      created_at: agora,
    } as never)

    if (erroLink) {
      registrarUltimoErroSupabase({
        mensagem: erroLink.message,
        entidade: 'comissao_settlement_items',
      })
      return {
        ok: false,
        erro: `Baixa criada, mas falhou vínculo do item ${aloc.item.id}: ${erroLink.message}`,
        settlement,
      }
    }

    alocacoesResult.push({
      commission_item_id: aloc.item.id,
      amount_paid: aloc.amount_paid,
      status_apos: aloc.status_apos,
    })
  }

  return {
    ok: true,
    settlement,
    alocacoes: alocacoesResult,
    excedente: excedente > 0.009 ? excedente : 0,
  }
}
