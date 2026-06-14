import { getSupabaseClient } from '@/lib/supabase'
import { MSG } from '@/lib/mensagens-usuario'
import {
  aplicarOfficeUuidEmDadosFase1,
  type ContextoOfficeSupabase,
} from '@/lib/supabase-office-context'
import { obterUuidPorLocalId } from '@/services/supabase-sync/id-registry'
import {
  buscarOsSupabasePorNumero,
  osExisteNoSupabasePorId,
} from '@/services/supabase-sync/payment-os-sync.service'
import {
  resolverOsSalvaNoSupabase,
  resolverUuidOs,
} from '@/services/supabase-sync/payment-sync.helpers'
import {
  extrairDadosFase1ParaOs,
  persistirFase1NoSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import type { CraftDatabase } from '@/types/database'
import type { OrdemServico } from '@/types/ordem-servico'

export const MENSAGEM_CLIENTE_MOTO_PENDENTE =
  'Pagamento pendente: cliente ou moto da OS ainda não existe no Supabase.'

export const MENSAGEM_OS_NAO_TOTALMENTE_SINCRONIZADA = MSG.salveOsAntesPagamento

export interface OsSupabaseCompleta {
  id: string
  number?: number
  customer_id: string | null
  motorcycle_id: string | null
}

export interface IdsPagamentoSupabase {
  service_order_id: string
  customer_id: string | null
  motorcycle_id: string | null
  customer_id_local?: string
  motorcycle_id_local?: string
  customer_existe: boolean
  motorcycle_existe: boolean
}

export async function buscarOsSupabasePorUuid(
  officeUuid: string,
  osUuid: string
): Promise<OsSupabaseCompleta | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('service_orders')
    .select('id, number, customer_id, motorcycle_id')
    .eq('office_id', officeUuid)
    .eq('id', osUuid)
    .maybeSingle<OsSupabaseCompleta>()

  if (error) {
    console.warn('[Craft Supabase] Busca OS por UUID:', error.message)
    return null
  }

  return data ?? null
}

export async function entidadeExisteNoSupabase(
  tabela: 'customers' | 'motorcycles',
  entidadeId: string | null | undefined,
  officeUuid: string
): Promise<boolean> {
  if (!entidadeId) return true

  const supabase = getSupabaseClient()
  if (!supabase) return false

  const { data, error } = await supabase
    .from(tabela)
    .select('id')
    .eq('office_id', officeUuid)
    .eq('id', entidadeId)
    .maybeSingle<{ id: string }>()

  if (error) {
    console.warn(`[Craft Supabase] Verificação ${tabela}:`, error.message)
    return false
  }

  return Boolean(data)
}

async function sincronizarDependenciasOs(
  officeUuid: string,
  os: OrdemServico,
  dados: CraftDatabase,
  contexto?: ContextoOfficeSupabase | null
): Promise<boolean> {
  const parcial = extrairDadosFase1ParaOs(dados, os.id)
  if (!parcial) return false

  const fase1 = aplicarOfficeUuidEmDadosFase1(parcial, officeUuid)
  const resultado = await persistirFase1NoSupabase(officeUuid, fase1, contexto?.opcoes)

  const osOk =
    resultado.contagem.service_orders > 0 ||
    resultado.contagem.customers > 0 ||
    resultado.contagem.motorcycles > 0 ||
    !resultado.erros.some((e) => e.id === os.id && e.entidade === 'Ordem de Serviço')

  if (!osOk && resultado.erros.length > 0) {
    console.error('[Craft Supabase] Falha ao sincronizar cliente/moto/OS', resultado.erros)
  }

  return osOk || (await osExisteNoSupabasePorId(officeUuid, await resolverUuidOs(os.id)))
}

/** Lê customer_id e motorcycle_id reais da OS no Supabase (nunca ids locais) */
export async function resolverIdsPagamentoDaOsSupabase(
  officeUuid: string,
  os: OrdemServico,
  dados: CraftDatabase,
  contexto?: ContextoOfficeSupabase | null,
  tentarSync = true
): Promise<{ ok: true; ids: IdsPagamentoSupabase } | { ok: false; motivo: string }> {
  const existente = await resolverOsSalvaNoSupabase(officeUuid, os)
  let osUuid = existente.service_order_id ?? (await resolverUuidOs(os.id))

  if (!existente.salva) {
    const porNumero = await buscarOsSupabasePorNumero(officeUuid, os.numero)
    if (porNumero) {
      osUuid = String(porNumero.id)
    } else if (tentarSync) {
      const syncOk = await sincronizarDependenciasOs(officeUuid, os, dados, contexto)
      if (!syncOk) {
        return { ok: false, motivo: MENSAGEM_CLIENTE_MOTO_PENDENTE }
      }
      osUuid = await resolverUuidOs(os.id)
    } else {
      return { ok: false, motivo: MENSAGEM_CLIENTE_MOTO_PENDENTE }
    }
  }

  let row = await buscarOsSupabasePorUuid(officeUuid, osUuid)
  if (!row && tentarSync) {
    await sincronizarDependenciasOs(officeUuid, os, dados, contexto)
    row = await buscarOsSupabasePorUuid(officeUuid, osUuid)
  }

  if (!row) {
    return { ok: false, motivo: MENSAGEM_CLIENTE_MOTO_PENDENTE }
  }

  let customerId = row.customer_id
  let motorcycleId = row.motorcycle_id

  let customerExiste = await entidadeExisteNoSupabase('customers', customerId, officeUuid)
  let motoExiste = await entidadeExisteNoSupabase('motorcycles', motorcycleId, officeUuid)

  if ((!customerExiste && customerId) || (!motoExiste && motorcycleId)) {
    if (tentarSync) {
      await sincronizarDependenciasOs(officeUuid, os, dados, contexto)
      row = await buscarOsSupabasePorUuid(officeUuid, osUuid)
      if (row) {
        customerId = row.customer_id
        motorcycleId = row.motorcycle_id
        customerExiste = await entidadeExisteNoSupabase('customers', customerId, officeUuid)
        motoExiste = await entidadeExisteNoSupabase('motorcycles', motorcycleId, officeUuid)
      }
    }
  }

  if (customerId && !customerExiste) {
    console.warn('[Craft Supabase] customer_id inválido na OS — omitindo do pagamento', {
      os_uuid: osUuid,
      customer_id: customerId,
    })
    customerId = null
  }

  if (motorcycleId && !motoExiste) {
    console.warn('[Craft Supabase] motorcycle_id inválido na OS — omitindo do pagamento', {
      os_uuid: osUuid,
      motorcycle_id: motorcycleId,
    })
    motorcycleId = null
  }

  if (!row) {
    return { ok: false, motivo: MENSAGEM_CLIENTE_MOTO_PENDENTE }
  }

  return {
    ok: true,
    ids: {
      service_order_id: String(row.id),
      customer_id: customerId,
      motorcycle_id: motorcycleId,
      customer_id_local: os.cliente_id,
      motorcycle_id_local: os.moto_id,
      customer_existe: customerExiste || !customerId,
      motorcycle_existe: motoExiste || !motorcycleId,
    },
  }
}

export function obterCustomerIdLocalMapeado(clienteLocalId?: string): string | undefined {
  if (!clienteLocalId) return undefined
  return obterUuidPorLocalId(clienteLocalId) ?? undefined
}

export function obterMotorcycleIdLocalMapeado(motoLocalId?: string): string | undefined {
  if (!motoLocalId) return undefined
  return obterUuidPorLocalId(motoLocalId) ?? undefined
}
