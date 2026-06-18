import { getSupabaseClient } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'

export const MENSAGEM_ERRO_RESERVA_NUMERO_OS =
  'Não foi possível reservar o número da OS. Tente novamente.'

export interface AuditoriaNumeracaoSupabase {
  office_id: string
  total_os: number
  maior_numero: number
  next_settings: number
  proximo_previsto: number
  duplicados: Array<{
    number: number
    quantidade: number
    ids: string[]
  }>
}

function rpcIndisponivel(mensagem: string): boolean {
  return /next_service_order_number|admin_audit_service_order_numbers|function.*does not exist|Could not find the function/i.test(
    mensagem
  )
}

/**
 * Reserva o próximo número de OS via RPC atômica no Supabase.
 * Em produção Supabase, esta é a ÚNICA fonte válida para nova OS.
 */
export async function reservarProximoNumeroOsSupabase(officeLocalId: string): Promise<number> {
  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  if (!contexto?.officeUuid) {
    throw new Error(MENSAGEM_ERRO_RESERVA_NUMERO_OS)
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error(MENSAGEM_ERRO_RESERVA_NUMERO_OS)
  }

  const { data, error } = await supabase.rpc('next_service_order_number', {
    p_office_id: contexto.officeUuid,
  } as never)

  if (error) {
    console.error('[Craft OS] RPC next_service_order_number falhou', error)
    if (rpcIndisponivel(error.message)) {
      throw new Error(
        `${MENSAGEM_ERRO_RESERVA_NUMERO_OS} Execute docs/supabase-service-order-numbering.sql no Supabase.`
      )
    }
    throw new Error(MENSAGEM_ERRO_RESERVA_NUMERO_OS)
  }

  const numero = Number(data)
  if (!Number.isFinite(numero) || numero < 1) {
    throw new Error(MENSAGEM_ERRO_RESERVA_NUMERO_OS)
  }

  if (import.meta.env.DEV) {
    console.info('[Craft OS] Número reservado via RPC Supabase', {
      office_id: contexto.officeUuid,
      numero,
    })
  }

  return numero
}

export async function auditarNumeracaoOsSupabase(
  officeLocalId: string
): Promise<AuditoriaNumeracaoSupabase | null> {
  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  if (!contexto?.officeUuid) return null

  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase.rpc('admin_audit_service_order_numbers', {
    p_office_id: contexto.officeUuid,
  } as never)

  if (error) {
    if (rpcIndisponivel(error.message)) {
      console.warn(
        '[Craft OS] RPC admin_audit_service_order_numbers não encontrada. Execute docs/supabase-service-order-numbering.sql'
      )
      return null
    }
    console.warn('[Craft OS] Falha na auditoria Supabase', error.message)
    return null
  }

  if (!data || typeof data !== 'object') return null
  return data as AuditoriaNumeracaoSupabase
}
