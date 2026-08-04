/**
 * RC2 Venda Balcão A1 — persistence Supabase (somente leitura/escrita de base).
 * Sem estoque, caixa, financeiro ou fiscal.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AdicionarItemVendaBalcaoInput,
  AtualizarVendaBalcaoInput,
  CriarVendaBalcaoInput,
  VendaBalcao,
  VendaBalcaoItem,
} from '@/types/venda-balcao'
import {
  itemVendaBalcaoParaInsertRow,
  mapearCounterSaleItemRow,
  mapearCounterSaleRow,
  vendaBalcaoParaInsertRow,
  vendaBalcaoParaUpdateRow,
  type CounterSaleItemRow,
  type CounterSaleRow,
} from '@/services/venda-balcao/venda-balcao-mappers'

const TABELA_VENDAS = 'counter_sales'
const TABELA_ITENS = 'counter_sale_items'

export async function persistListarVendasBalcao(
  client: SupabaseClient,
  officeUuid: string,
  officeIdLocal: string,
  opts?: { incluirExcluidas?: boolean; limite?: number }
): Promise<VendaBalcao[]> {
  let q = client
    .from(TABELA_VENDAS)
    .select('*')
    .eq('office_id', officeUuid)
    .order('sold_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(opts?.limite ?? 100)

  if (!opts?.incluirExcluidas) {
    q = q.is('deleted_at', null)
  }

  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as CounterSaleRow[]).map((row) =>
    mapearCounterSaleRow(row, officeIdLocal)
  )
}

export async function persistObterVendaBalcaoPorId(
  client: SupabaseClient,
  officeUuid: string,
  officeIdLocal: string,
  saleId: string,
  comItens = true
): Promise<VendaBalcao | null> {
  const { data, error } = await client
    .from(TABELA_VENDAS)
    .select('*')
    .eq('office_id', officeUuid)
    .eq('id', saleId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const venda = mapearCounterSaleRow(data as CounterSaleRow, officeIdLocal)
  if (!comItens) return venda

  const itens = await persistListarItensVendaBalcao(
    client,
    officeUuid,
    officeIdLocal,
    saleId
  )
  return { ...venda, itens }
}

export async function persistObterVendaBalcaoPorLocalId(
  client: SupabaseClient,
  officeUuid: string,
  officeIdLocal: string,
  localId: string
): Promise<VendaBalcao | null> {
  const { data, error } = await client
    .from(TABELA_VENDAS)
    .select('*')
    .eq('office_id', officeUuid)
    .eq('local_id', localId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return mapearCounterSaleRow(data as CounterSaleRow, officeIdLocal)
}

export async function persistCriarVendaBalcao(
  client: SupabaseClient,
  officeUuid: string,
  officeIdLocal: string,
  input: CriarVendaBalcaoInput
): Promise<VendaBalcao> {
  const row = vendaBalcaoParaInsertRow(officeUuid, input)
  const { data, error } = await client
    .from(TABELA_VENDAS)
    .insert(row)
    .select('*')
    .single()

  // Retry seguro: mesmo local_id (evita venda duplicada ao reenviar o formulário)
  if (error && input.local_id && (error.code === '23505' || /duplicate key/i.test(error.message ?? ''))) {
    const existente = await persistObterVendaBalcaoPorLocalId(
      client,
      officeUuid,
      officeIdLocal,
      input.local_id
    )
    if (existente) return existente
  }

  if (error) throw error
  return mapearCounterSaleRow(data as CounterSaleRow, officeIdLocal)
}

export async function persistAtualizarVendaBalcao(
  client: SupabaseClient,
  officeUuid: string,
  officeIdLocal: string,
  saleId: string,
  input: AtualizarVendaBalcaoInput
): Promise<VendaBalcao> {
  const patch = vendaBalcaoParaUpdateRow(input)
  const { data, error } = await client
    .from(TABELA_VENDAS)
    .update(patch)
    .eq('office_id', officeUuid)
    .eq('id', saleId)
    .select('*')
    .single()

  if (error) throw error
  return mapearCounterSaleRow(data as CounterSaleRow, officeIdLocal)
}

export async function persistListarItensVendaBalcao(
  client: SupabaseClient,
  officeUuid: string,
  officeIdLocal: string,
  saleId: string
): Promise<VendaBalcaoItem[]> {
  const { data, error } = await client
    .from(TABELA_ITENS)
    .select('*')
    .eq('office_id', officeUuid)
    .eq('sale_id', saleId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) throw error
  return ((data ?? []) as CounterSaleItemRow[]).map((row) =>
    mapearCounterSaleItemRow(row, officeIdLocal)
  )
}

export async function persistCriarItemVendaBalcao(
  client: SupabaseClient,
  officeUuid: string,
  officeIdLocal: string,
  saleId: string,
  input: AdicionarItemVendaBalcaoInput
): Promise<VendaBalcaoItem> {
  const row = itemVendaBalcaoParaInsertRow(officeUuid, saleId, input)
  const { data, error } = await client
    .from(TABELA_ITENS)
    .insert(row)
    .select('*')
    .single()

  if (error && input.local_id && (error.code === '23505' || /duplicate key/i.test(error.message ?? ''))) {
    const { data: existente, error: errExistente } = await client
      .from(TABELA_ITENS)
      .select('*')
      .eq('office_id', officeUuid)
      .eq('local_id', input.local_id)
      .maybeSingle()
    if (!errExistente && existente) {
      return mapearCounterSaleItemRow(existente as CounterSaleItemRow, officeIdLocal)
    }
  }

  if (error) throw error
  return mapearCounterSaleItemRow(data as CounterSaleItemRow, officeIdLocal)
}
