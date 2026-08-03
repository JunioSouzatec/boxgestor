/**
 * RC2 Venda Balcão Fase A1 — services base.
 * Sem UI, sem baixa de estoque, sem caixa, sem financeiro, sem nota fiscal.
 *
 * Ponto preparado para Fase A2 (baixa estoque):
 *   → baixarEstoqueVendaBalcao(vendaId) — NÃO implementar aqui.
 */
import { getSupabaseClient, isSupabaseConfigured, getCraftPersistenceMode } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { aguardarSessaoAuthSupabase } from '@/lib/supabase-session-ready'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import type {
  AdicionarItemVendaBalcaoInput,
  AtualizarVendaBalcaoInput,
  CriarVendaBalcaoInput,
  TotaisVendaBalcao,
  VendaBalcao,
  VendaBalcaoItem,
} from '@/types/venda-balcao'
import {
  persistAtualizarVendaBalcao,
  persistCriarItemVendaBalcao,
  persistCriarVendaBalcao,
  persistListarItensVendaBalcao,
  persistListarVendasBalcao,
  persistObterVendaBalcaoPorId,
} from '@/services/venda-balcao/supabase-venda-balcao.persistence'

export function vendaBalcaoDisponivel(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100
}

function tabelaInexistente(mensagem: string): boolean {
  const msg = mensagem.toLowerCase()
  return (
    msg.includes('does not exist') ||
    msg.includes('relation') ||
    msg.includes('could not find the table')
  )
}

async function resolverOfficeUuid(officeIdLocal: string): Promise<string | null> {
  const contexto = await obterContextoOfficeSupabase(officeIdLocal)
  return contexto?.officeUuid ?? null
}

/** Calcula totais a partir dos itens (puro; sem side-effects). */
export function calcularTotaisVendaBalcao(
  itens: Array<Pick<VendaBalcaoItem, 'quantity' | 'unit_price' | 'discount' | 'total'>>,
  opts?: { paid_amount?: number; payment_status?: 'paid' | 'pending' | 'canceled' }
): TotaisVendaBalcao {
  const subtotal = arredondar2(
    itens.reduce((acc, i) => {
      const q = Number(i.quantity) || 0
      const p = Number(i.unit_price) || 0
      return acc + q * p
    }, 0)
  )
  const discount_total = arredondar2(
    itens.reduce((acc, i) => acc + (Number(i.discount) || 0), 0)
  )
  const totalFromLines = arredondar2(
    itens.reduce((acc, i) => {
      if (i.total != null && Number.isFinite(Number(i.total))) {
        return acc + Number(i.total)
      }
      const q = Number(i.quantity) || 0
      const p = Number(i.unit_price) || 0
      const d = Number(i.discount) || 0
      return acc + Math.max(0, q * p - d)
    }, 0)
  )
  const total = arredondar2(
    Math.max(0, totalFromLines > 0 ? totalFromLines : subtotal - discount_total)
  )
  const paid =
    opts?.payment_status === 'paid'
      ? arredondar2(opts.paid_amount != null ? opts.paid_amount : total)
      : arredondar2(Math.max(0, opts?.paid_amount ?? 0))
  const pending =
    opts?.payment_status === 'canceled'
      ? 0
      : arredondar2(Math.max(0, total - paid))

  return {
    subtotal,
    discount_total,
    total,
    paid_amount: paid,
    pending_amount: pending,
  }
}

/**
 * Fase A2 — NÃO implementar na A1.
 * Aqui entrará a baixa real em inventory_items + inventory_movements
 * sem alterar o fluxo de XML de compra nem a baixa de OS.
 */
export async function baixarEstoqueVendaBalcao(_params: {
  officeIdLocal: string
  saleId: string
}): Promise<never> {
  throw new Error(
    'baixarEstoqueVendaBalcao: reservado para Fase A2. A1 não baixa estoque.'
  )
}

export async function listarVendasBalcao(
  officeIdLocal: string,
  opts?: { incluirExcluidas?: boolean; limite?: number }
): Promise<VendaBalcao[]> {
  if (!vendaBalcaoDisponivel()) return []
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) return []
  try {
    await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
    return await persistListarVendasBalcao(supabase, officeUuid, officeIdLocal, opts)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (tabelaInexistente(msg)) return []
    registrarUltimoErroSupabase({ mensagem: msg, entidade: 'venda_balcao' })
    throw e
  }
}

export async function obterVendaBalcaoPorId(
  officeIdLocal: string,
  saleId: string,
  comItens = true
): Promise<VendaBalcao | null> {
  if (!vendaBalcaoDisponivel()) return null
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) return null
  try {
    await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
    return await persistObterVendaBalcaoPorId(
      supabase,
      officeUuid,
      officeIdLocal,
      saleId,
      comItens
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (tabelaInexistente(msg)) return null
    registrarUltimoErroSupabase({ mensagem: msg, entidade: 'venda_balcao' })
    throw e
  }
}

export async function criarVendaBalcao(
  officeIdLocal: string,
  input: CriarVendaBalcaoInput
): Promise<VendaBalcao> {
  if (!vendaBalcaoDisponivel()) {
    throw new Error('Venda balcão indisponível: modo Supabase necessário.')
  }
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Cliente Supabase indisponível.')
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) throw new Error('Oficina não vinculada ao Supabase.')
  try {
    await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
    return await persistCriarVendaBalcao(supabase, officeUuid, officeIdLocal, input)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    registrarUltimoErroSupabase({ mensagem: msg, entidade: 'venda_balcao' })
    throw e
  }
}

export async function atualizarVendaBalcao(
  officeIdLocal: string,
  saleId: string,
  input: AtualizarVendaBalcaoInput
): Promise<VendaBalcao> {
  if (!vendaBalcaoDisponivel()) {
    throw new Error('Venda balcão indisponível: modo Supabase necessário.')
  }
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Cliente Supabase indisponível.')
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) throw new Error('Oficina não vinculada ao Supabase.')
  try {
    await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
    return await persistAtualizarVendaBalcao(
      supabase,
      officeUuid,
      officeIdLocal,
      saleId,
      input
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    registrarUltimoErroSupabase({ mensagem: msg, entidade: 'venda_balcao' })
    throw e
  }
}

export async function listarItensVendaBalcao(
  officeIdLocal: string,
  saleId: string
): Promise<VendaBalcaoItem[]> {
  if (!vendaBalcaoDisponivel()) return []
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) return []
  try {
    await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
    return await persistListarItensVendaBalcao(
      supabase,
      officeUuid,
      officeIdLocal,
      saleId
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (tabelaInexistente(msg)) return []
    registrarUltimoErroSupabase({ mensagem: msg, entidade: 'venda_balcao' })
    throw e
  }
}

export async function criarItemVendaBalcao(
  officeIdLocal: string,
  saleId: string,
  input: AdicionarItemVendaBalcaoInput
): Promise<VendaBalcaoItem> {
  if (!vendaBalcaoDisponivel()) {
    throw new Error('Venda balcão indisponível: modo Supabase necessário.')
  }
  if (!input.item_name?.trim()) {
    throw new Error('Nome do item é obrigatório.')
  }
  if (!(Number(input.quantity) > 0)) {
    throw new Error('Quantidade deve ser maior que zero.')
  }
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Cliente Supabase indisponível.')
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) throw new Error('Oficina não vinculada ao Supabase.')
  try {
    await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
    return await persistCriarItemVendaBalcao(
      supabase,
      officeUuid,
      officeIdLocal,
      saleId,
      input
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    registrarUltimoErroSupabase({ mensagem: msg, entidade: 'venda_balcao' })
    throw e
  }
}
