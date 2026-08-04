/**
 * RC2 Venda Balcão — services (A1 base + A2 marcação de baixa).
 * Baixa local: `venda-balcao-estoque.service.ts` via CraftContext.
 * Sem caixa, financeiro, recibo ou nota fiscal.
 */
import { getSupabaseClient, isSupabaseConfigured, getCraftPersistenceMode } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { aguardarSessaoAuthSupabase } from '@/lib/supabase-session-ready'
import { isUuidFormato } from '@/lib/local-id-uuid'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import { verificarPecaNoSupabase } from '@/services/estoque/supabase-estoque.persistence'
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
import {
  VendaBalcaoSaveError,
  logErroVendaBalcao,
} from '@/services/venda-balcao/venda-balcao-errors'

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
 * Baixa de estoque local: ver `venda-balcao-estoque.service.ts` + CraftContext.
 * Esta função só marca no Supabase que a baixa já foi aplicada (idempotência).
 */
export async function marcarEstoqueBaixadoNaVenda(
  officeIdLocal: string,
  saleId: string,
  snapshots: Array<{
    sale_item_id?: string
    peca_id: string
    stock_before: number
    stock_after: number
  }>
): Promise<void> {
  const venda = await obterVendaBalcaoPorId(officeIdLocal, saleId, true)
  if (!venda) return
  if (venda.craft_meta?.stock_baixado === true) return

  await atualizarVendaBalcao(officeIdLocal, saleId, {
    craft_meta: {
      ...venda.craft_meta,
      stock_baixado: true,
      stock_baixado_em: new Date().toISOString(),
    },
  })

  if (!vendaBalcaoDisponivel()) return
  const supabase = getSupabaseClient()
  if (!supabase) return
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) return

  for (const snap of snapshots) {
    const item = (venda.itens ?? []).find(
      (i) =>
        (snap.sale_item_id && i.id === snap.sale_item_id) ||
        i.inventory_local_id === snap.peca_id
    )
    if (!item) continue
    await supabase
      .from('counter_sale_items')
      .update({
        stock_before: snap.stock_before,
        stock_after: snap.stock_after,
        craft_meta: {
          ...item.craft_meta,
          stock_baixado: true,
        },
      } as never)
      .eq('office_id', officeUuid)
      .eq('id', item.id)
  }
}

export async function proximoNumeroVendaBalcao(officeIdLocal: string): Promise<number> {
  const lista = await listarVendasBalcao(officeIdLocal, {
    incluirExcluidas: true,
    limite: 200,
  })
  const max = lista.reduce((acc, v) => Math.max(acc, v.sale_number ?? 0), 0)
  return max + 1
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

/**
 * Resolve UUID real de inventory_items pela peça local.
 * Se não existir no remoto, retorna null (não inventa UUID — evita FK 23503).
 */
export async function resolverInventoryItemIdVendaBalcao(
  officeIdLocal: string,
  pecaLocalId: string
): Promise<string | undefined> {
  const verificacao = await verificarPecaNoSupabase(officeIdLocal, pecaLocalId)
  if (verificacao.existe && verificacao.inventoryItemId) {
    return verificacao.inventoryItemId
  }
  // Fallback seguro: só usa o id local se já for UUID válido do inventário
  if (isUuidFormato(pecaLocalId)) return pecaLocalId.trim()
  return undefined
}

export async function criarVendaBalcao(
  officeIdLocal: string,
  input: CriarVendaBalcaoInput
): Promise<VendaBalcao> {
  if (!vendaBalcaoDisponivel()) {
    throw new VendaBalcaoSaveError(
      'criar_counter_sales',
      new Error('Venda balcão indisponível: modo Supabase necessário.')
    )
  }
  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new VendaBalcaoSaveError(
      'criar_counter_sales',
      new Error('Cliente Supabase indisponível.')
    )
  }
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    throw new VendaBalcaoSaveError(
      'criar_counter_sales',
      new Error('Oficina não vinculada ao Supabase.')
    )
  }

  const sellerUserId =
    input.seller_user_id && isUuidFormato(input.seller_user_id)
      ? input.seller_user_id.trim()
      : undefined

  const payloadSeguro = {
    office_uuid: officeUuid,
    local_id: input.local_id ?? null,
    sale_number: input.sale_number ?? null,
    status: input.status ?? null,
    payment_status: input.payment_status ?? null,
    payment_method: input.payment_method ?? null,
    total: input.total ?? null,
    seller_user_id: sellerUserId ?? null,
    has_seller_name: Boolean(input.seller_name),
  }

  try {
    await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
    return await persistCriarVendaBalcao(supabase, officeUuid, officeIdLocal, {
      ...input,
      seller_user_id: sellerUserId,
    })
  } catch (e) {
    logErroVendaBalcao({
      etapa: 'criar_counter_sales',
      erro: e,
      payload: payloadSeguro,
    })
    const msg = e instanceof Error ? e.message : String(e)
    registrarUltimoErroSupabase({ mensagem: msg, entidade: 'venda_balcao' })
    throw new VendaBalcaoSaveError('criar_counter_sales', e)
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
    throw new VendaBalcaoSaveError(
      'criar_counter_sale_items',
      new Error('Venda balcão indisponível: modo Supabase necessário.')
    )
  }
  if (!input.item_name?.trim()) {
    throw new VendaBalcaoSaveError(
      'criar_counter_sale_items',
      new Error('Nome do item é obrigatório.'),
      'Não foi possível salvar a venda: falha ao registrar item da venda.'
    )
  }
  if (!(Number(input.quantity) > 0)) {
    throw new VendaBalcaoSaveError(
      'validacao',
      new Error('Quantidade deve ser maior que zero.'),
      'Não foi possível salvar a venda: quantidade deve ser maior que zero.'
    )
  }
  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new VendaBalcaoSaveError(
      'criar_counter_sale_items',
      new Error('Cliente Supabase indisponível.')
    )
  }
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    throw new VendaBalcaoSaveError(
      'criar_counter_sale_items',
      new Error('Oficina não vinculada ao Supabase.')
    )
  }

  let inventoryItemId = input.inventory_item_id
  if (inventoryItemId && !isUuidFormato(inventoryItemId)) {
    inventoryItemId = undefined
  }
  if (!inventoryItemId && input.inventory_local_id) {
    inventoryItemId = await resolverInventoryItemIdVendaBalcao(
      officeIdLocal,
      input.inventory_local_id
    )
  }

  const payloadSeguro = {
    office_uuid: officeUuid,
    sale_id: saleId,
    inventory_item_id: inventoryItemId ?? null,
    inventory_local_id: input.inventory_local_id ?? null,
    item_name: input.item_name?.trim() ?? null,
    quantity: input.quantity,
    unit_price: input.unit_price,
    discount: input.discount ?? 0,
    total: input.total ?? null,
  }

  try {
    await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
    return await persistCriarItemVendaBalcao(
      supabase,
      officeUuid,
      officeIdLocal,
      saleId,
      {
        ...input,
        inventory_item_id: inventoryItemId,
      }
    )
  } catch (e) {
    logErroVendaBalcao({
      etapa: 'criar_counter_sale_items',
      erro: e,
      payload: payloadSeguro,
    })
    const msg = e instanceof Error ? e.message : String(e)
    registrarUltimoErroSupabase({ mensagem: msg, entidade: 'venda_balcao' })
    throw new VendaBalcaoSaveError('criar_counter_sale_items', e)
  }
}
