import { getSupabaseClient } from '@/lib/supabase'
import { localIdParaUuid } from '@/lib/local-id-uuid'
import {
  obterLocalIdPorUuid,
  obterUuidPorLocalId,
  registrarMapeamentoId,
} from '@/services/supabase-sync/id-registry'
import type { CraftDatabase } from '@/types/database'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'

export interface DiagnosticoVinculoPagamentoOs {
  payment_id: string
  payment_local_id: string
  ordem_servico_id_local?: string
  ordem_servico_uuid?: string | null
  office_id: string
  os_local_encontrada: boolean
  os_local_id?: string
  os_numero?: number
  os_supabase_encontrada: boolean
  os_supabase_id?: string
  estrategia?: string
  erro?: string
}

export interface ResultadoResolucaoOsPagamento {
  os: OrdemServico | null
  osLocalId: string | null
  osUuid: string | null
  estrategia?: string
  diagnostico: DiagnosticoVinculoPagamentoOs
}

interface ServiceOrderRowMin {
  id: string
  number?: number
  parts_used?: unknown
  customer_id?: string | null
  motorcycle_id?: string | null
}

export function extrairNumeroOsDaDescricaoPagamento(descricao: string): number | null {
  const match = descricao.match(/OS\s*#(\d+)/i)
  if (!match) return null
  const n = parseInt(match[1], 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Retorna a OS local quando o pagamento já tem ordem_servico_id válido e consistente.
 * Não reassocia por descrição, cliente, moto ou data.
 */
export function obterOsLocalConfiavelDoPagamento(
  lancamento: LancamentoFinanceiro,
  dados: CraftDatabase
): OrdemServico | null {
  const vinculoId = lancamento.ordem_servico_id?.trim()
  if (!vinculoId) return null

  const osAtual = dados.ordens_servico.find((o) => o.id === vinculoId)
  if (!osAtual) return null

  const numeroDescricao = extrairNumeroOsDaDescricaoPagamento(lancamento.descricao)
  if (numeroDescricao != null && numeroDescricao !== osAtual.numero) return null

  return osAtual
}

function extrairLocalIdOsDoRowSupabase(row: ServiceOrderRowMin): string | null {
  const parts = row.parts_used as { craft_meta?: { local_id?: string } } | undefined
  const metaLocal = parts?.craft_meta?.local_id?.trim()
  if (metaLocal) return metaLocal
  return obterLocalIdPorUuid(row.id) ?? null
}

export async function resolverUuidOsMapeado(osLocalId: string): Promise<string> {
  return obterUuidPorLocalId(osLocalId) ?? (await localIdParaUuid(osLocalId))
}

export async function resolverOsParaPagamento(
  lancamento: LancamentoFinanceiro,
  dados: CraftDatabase,
  officeUuid: string
): Promise<ResultadoResolucaoOsPagamento> {
  const diag: DiagnosticoVinculoPagamentoOs = {
    payment_id: lancamento.id,
    payment_local_id: lancamento.id,
    ordem_servico_id_local: lancamento.ordem_servico_id,
    office_id: officeUuid,
    os_local_encontrada: false,
    os_supabase_encontrada: false,
  }

  const registrarOs = async (os: OrdemServico, estrategia: string): Promise<ResultadoResolucaoOsPagamento> => {
    const osUuid = await resolverUuidOsMapeado(os.id)
    diag.os_local_encontrada = true
    diag.os_local_id = os.id
    diag.os_numero = os.numero
    diag.ordem_servico_uuid = osUuid
    diag.estrategia = estrategia

    const supabase = getSupabaseClient()
    if (supabase) {
      const { data } = await supabase
        .from('service_orders')
        .select('id')
        .eq('office_id', officeUuid)
        .eq('id', osUuid)
        .maybeSingle<ServiceOrderRowMin>()
      if (data) {
        diag.os_supabase_encontrada = true
        diag.os_supabase_id = String(data.id)
        registrarMapeamentoId(os.id, String(data.id))
      }
    }

    return { os, osLocalId: os.id, osUuid, estrategia, diagnostico: diag }
  }

  // 1. Id local direto (ordem_servico_id do lançamento)
  if (lancamento.ordem_servico_id) {
    const os = dados.ordens_servico.find((o) => o.id === lancamento.ordem_servico_id)
    if (os) {
      return registrarOs(os, 'id_local_direto')
    }
    diag.ordem_servico_uuid = await resolverUuidOsMapeado(lancamento.ordem_servico_id)
    diag.erro =
      'ordem_servico_id não corresponde a nenhuma OS local — vínculo mantido como pendência (sem reassociação automática)'
    console.warn('[Craft Supabase] Pagamento com ordem_servico_id órfão', diag)
    return {
      os: null,
      osLocalId: lancamento.ordem_servico_id,
      osUuid: diag.ordem_servico_uuid,
      diagnostico: diag,
    }
  }

  // 2. Número da OS na descrição ("Pagamento OS #123") — somente sem ordem_servico_id
  const numeroDescricao = extrairNumeroOsDaDescricaoPagamento(lancamento.descricao)
  if (numeroDescricao != null) {
    diag.os_numero = numeroDescricao
    const osPorNumero = dados.ordens_servico.find((o) => o.numero === numeroDescricao)
    if (osPorNumero) {
      return registrarOs(osPorNumero, 'numero_local_descricao')
    }
  }

  // 3. Buscar no Supabase por office_id + number
  const supabase = getSupabaseClient()
  if (supabase && numeroDescricao != null) {
    const { data: rowNumero, error } = await supabase
      .from('service_orders')
      .select('id, number, parts_used, customer_id, motorcycle_id')
      .eq('office_id', officeUuid)
      .eq('number', numeroDescricao)
      .maybeSingle<ServiceOrderRowMin>()

    if (error) {
      diag.erro = error.message
    } else if (rowNumero) {
      diag.os_supabase_encontrada = true
      diag.os_supabase_id = String(rowNumero.id)

      const localIdMeta = extrairLocalIdOsDoRowSupabase(rowNumero)
      if (localIdMeta) {
        registrarMapeamentoId(localIdMeta, String(rowNumero.id))
        const osLocal = dados.ordens_servico.find((o) => o.id === localIdMeta)
        if (osLocal) {
          return registrarOs(osLocal, 'supabase_numero_mapeado')
        }
      }

      const osPorNumeroAposMeta = dados.ordens_servico.find((o) => o.numero === numeroDescricao)
      if (osPorNumeroAposMeta) {
        registrarMapeamentoId(osPorNumeroAposMeta.id, String(rowNumero.id))
        return registrarOs(osPorNumeroAposMeta, 'supabase_numero_local')
      }
    }
  }

  console.warn('[Craft Supabase] Vínculo pagamento ↔ OS não resolvido', diag)

  return {
    os: null,
    osLocalId: null,
    osUuid: null,
    diagnostico: diag,
  }
}

export function logDiagnosticoVinculoPagamento(diag: DiagnosticoVinculoPagamentoOs): void {
  console.info('[Craft Supabase] Diagnóstico vínculo pagamento ↔ OS', {
    payment_id: diag.payment_id,
    ordem_servico_id_local: diag.ordem_servico_id_local,
    ordem_servico_uuid: diag.ordem_servico_uuid,
    office_id: diag.office_id,
    os_local_encontrada: diag.os_local_encontrada,
    os_local_id: diag.os_local_id,
    os_numero: diag.os_numero,
    os_supabase_encontrada: diag.os_supabase_encontrada,
    os_supabase_id: diag.os_supabase_id,
    estrategia: diag.estrategia,
    erro: diag.erro,
  })
}

/** @deprecated Use garantirOsParaPagamentosPendentes em payment-os-sync.service.ts */
export { garantirOsParaPagamentosPendentes as sincronizarDependenciasPagamentosPendentes } from '@/services/supabase-sync/payment-os-sync.service'
