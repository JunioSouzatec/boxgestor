import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { deveUsarSupabaseAuth } from '@/services/auth/auth.factory'

export interface ResultadoResetSupabase {
  ok: boolean
  erros: string[]
  ignorado: boolean
}

/**
 * Tabelas que o fallback autenticado ainda pode limpar via DELETE direto.
 * `service_orders` NÃO entra aqui: limpeza remota de OS só via RPC
 * `reset_office_test_data` (SECURITY DEFINER), para não depender de GRANT DELETE.
 */
type TabelaOperacionalFallback =
  | 'service_order_photos'
  | 'service_order_payments'
  | 'financial_transactions'
  | 'warranties'
  | 'appointments'
  | 'inventory_movements'
  | 'inventory_items'
  | 'motorcycles'
  | 'customers'

const AVISO_OS_REQUER_RPC =
  'service_orders: limpeza remota exige RPC reset_office_test_data (DELETE autenticado direto não é usado).'

async function deletarPorOffice(
  tabela: TabelaOperacionalFallback,
  officeUuid: string
): Promise<string | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return 'Cliente Supabase indisponível'

  const { error } = await supabase.from(tabela as never).delete().eq('office_id', officeUuid)

  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return null
    }
    return `${tabela}: ${error.message}`
  }

  return null
}

async function tentarRpcReset(incluirEstoque: boolean): Promise<string | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return 'Cliente Supabase indisponível'

  const { error } = await supabase.rpc(
    'reset_office_test_data' as never,
    { p_incluir_estoque: incluirEstoque } as never
  )

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message?.includes('Could not find the function') ||
      error.message?.includes('function public.reset_office_test_data')
    ) {
      return null
    }
    return error.message
  }

  return 'rpc_ok'
}

/**
 * Apaga dados operacionais da oficina no Supabase, respeitando FKs e RLS (office_id do profile).
 * Ordens de serviço remotas: somente via RPC `reset_office_test_data`.
 */
export async function limparDadosOperacionaisSupabase(
  officeLocalId: string,
  incluirEstoque: boolean
): Promise<ResultadoResetSupabase> {
  if (!isSupabaseConfigured()) {
    return { ok: true, erros: [], ignorado: true }
  }

  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  if (!contexto?.officeUuid) {
    if (deveUsarSupabaseAuth()) {
      return {
        ok: false,
        erros: ['Não foi possível identificar a oficina no Supabase. Faça login novamente.'],
        ignorado: false,
      }
    }
    return { ok: true, erros: [], ignorado: true }
  }

  const officeUuid = contexto.officeUuid
  const erros: string[] = []

  const rpcResult = await tentarRpcReset(incluirEstoque)
  if (rpcResult === 'rpc_ok') {
    return { ok: true, erros: [], ignorado: false }
  }
  if (rpcResult && rpcResult !== null) {
    erros.push(rpcResult)
  }

  // Fallback autenticado: demais tabelas. Nunca service_orders (sem GRANT DELETE).
  erros.push(AVISO_OS_REQUER_RPC)

  const ordem: TabelaOperacionalFallback[] = [
    'service_order_photos',
    'service_order_payments',
    'financial_transactions',
    'warranties',
    'appointments',
  ]

  if (incluirEstoque) {
    ordem.push('inventory_movements', 'inventory_items')
  }

  ordem.push('motorcycles', 'customers')

  for (const tabela of ordem) {
    const erro = await deletarPorOffice(tabela, officeUuid)
    if (erro) erros.push(erro)
  }

  return {
    ok: erros.length === 0,
    erros,
    ignorado: false,
  }
}
