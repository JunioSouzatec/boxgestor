import { MSG, logDetalheTecnicoDev } from '@/lib/mensagens-usuario'
import { getCraftPersistenceMode, getSupabaseClient } from '@/lib/supabase'
import {
  aplicarOfficeUuidEmDadosFase1,
  obterContextoOfficeSupabase,
} from '@/lib/supabase-office-context'
import { obterUuidPorLocalId, registrarMapeamentoId } from '@/services/supabase-sync/id-registry'
import { atualizarContagemPendenciasAtivas } from '@/services/persistence-status.events'
import {
  buscarOsSupabasePorNumero,
  vincularOsExistentePorNumero,
} from '@/services/supabase-sync/payment-os-sync.service'
import {
  extrairDadosFase1ParaOs,
  persistirFase1NoSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import type { CraftDatabase } from '@/types/database'
import type { OrdemServico } from '@/types/ordem-servico'
import type { ServiceOrderRow } from '@/services/supabase-sync/reverse-mappers'

export const MENSAGEM_OS_SALVA_SUPABASE = MSG.osSalva
export const MENSAGEM_OS_ATUALIZADA_SUPABASE = MSG.osAlterada
export const MENSAGEM_OS_FALLBACK_LOCAL = MSG.semConexao

export interface ResultadoSalvarOsSupabase {
  ok: boolean
  confirmadoSupabase: boolean
  fallbackLocal: boolean
  service_order_id?: string
  mensagem: string
  erros: string[]
}

function logSalvarOsDev(dados: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  console.info('[Craft Supabase] Salvamento OS', dados)
}

async function relerServiceOrderDoSupabase(
  officeUuid: string,
  serviceOrderId: string
): Promise<ServiceOrderRow | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('service_orders')
    .select('*')
    .eq('office_id', officeUuid)
    .eq('id', serviceOrderId)
    .maybeSingle<ServiceOrderRow>()

  if (error) {
    console.warn('[Craft Supabase] Releitura OS após salvar:', error.message)
    return null
  }

  return data ?? null
}

function limparPendenciasOsSalva(
  officeLocalId: string,
  os: OrdemServico
): void {
  syncQueueService.marcarSincronizadosPorEntidade(officeLocalId, 'ordem_servico', os.id)
  syncQueueService.marcarSincronizadosPorEntidade(officeLocalId, 'cliente', os.cliente_id)
  syncQueueService.marcarSincronizadosPorEntidade(officeLocalId, 'moto', os.moto_id)
  syncQueueService.limparPendentesFase1(officeLocalId)
  atualizarContagemPendenciasAtivas(officeLocalId)
}

/**
 * Salva OS no Supabase com confirmação por releitura.
 * Garante cliente/moto antes da OS (via persistirFase1 focado).
 */
export async function salvarOsComConfirmacaoSupabase(
  officeLocalId: string,
  os: OrdemServico,
  dados: CraftDatabase,
  opcoes?: { eraNova?: boolean }
): Promise<ResultadoSalvarOsSupabase> {
  const erros: string[] = []

  if (getCraftPersistenceMode() !== 'supabase') {
    return {
      ok: true,
      confirmadoSupabase: false,
      fallbackLocal: false,
      mensagem: opcoes?.eraNova ? MSG.osSalva : MSG.osAlterada,
      erros,
    }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: true,
      confirmadoSupabase: false,
      fallbackLocal: true,
      mensagem: MENSAGEM_OS_FALLBACK_LOCAL,
      erros: ['Sem conexão com a internet'],
    }
  }

  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  if (!contexto?.officeUuid) {
    return {
      ok: false,
      confirmadoSupabase: false,
      fallbackLocal: true,
      mensagem: MENSAGEM_OS_FALLBACK_LOCAL,
      erros: ['Usuário sem office_id vinculado no Supabase'],
    }
  }

  const officeUuid = contexto.officeUuid
  const parcial = extrairDadosFase1ParaOs(dados, os.id)
  if (!parcial) {
    return {
      ok: false,
      confirmadoSupabase: false,
      fallbackLocal: true,
      mensagem: MENSAGEM_OS_FALLBACK_LOCAL,
      erros: ['OS não encontrada nos dados locais'],
    }
  }

  const cliente = parcial.clientes[0]
  const moto = parcial.motos[0]

  if (!cliente || !moto) {
    return {
      ok: false,
      confirmadoSupabase: false,
      fallbackLocal: true,
      mensagem: MENSAGEM_OS_FALLBACK_LOCAL,
      erros: ['Cliente ou moto da OS não encontrados nos dados locais'],
    }
  }

  const fase1 = aplicarOfficeUuidEmDadosFase1(parcial, officeUuid)

  logSalvarOsDev({
    office_id: officeUuid,
    os_local_id: os.id,
    os_numero: os.numero,
    customer_id_local: os.cliente_id,
    motorcycle_id_local: os.moto_id,
    payload_resumo: {
      clientes: fase1.clientes.length,
      motos: fase1.motos.length,
      ordens: fase1.ordens_servico.length,
    },
  })

  const resultado = await persistirFase1NoSupabase(officeUuid, fase1, {
    ...contexto.opcoes,
    pularOficina: true,
  })

  const osErro = resultado.erros.find(
    (e) => e.id === os.id && e.entidade === 'Ordem de Serviço'
  )
  if (osErro) {
    logDetalheTecnicoDev('OS fallback', {
      fallback_local: true,
      motivo: osErro.mensagem,
      erros: resultado.erros,
    })
    return {
      ok: false,
      confirmadoSupabase: false,
      fallbackLocal: true,
      mensagem: MENSAGEM_OS_FALLBACK_LOCAL,
      erros: [osErro.mensagem, ...resultado.avisos],
    }
  }

  let serviceOrderId = obterUuidPorLocalId(os.id)
  if (!serviceOrderId) {
    serviceOrderId = (await vincularOsExistentePorNumero(os, officeUuid)) ?? undefined
  }
  if (!serviceOrderId) {
    const porNumero = await buscarOsSupabasePorNumero(officeUuid, os.numero)
    if (porNumero) {
      serviceOrderId = String(porNumero.id)
      registrarMapeamentoId(os.id, serviceOrderId)
    }
  }

  if (!serviceOrderId) {
    logSalvarOsDev({
      fallback_local: true,
      motivo: 'UUID da OS não resolvido após persistência',
      contagem: resultado.contagem,
      erros: resultado.erros,
    })
    return {
      ok: false,
      confirmadoSupabase: false,
      fallbackLocal: true,
      mensagem: MENSAGEM_OS_FALLBACK_LOCAL,
      erros: ['Não foi possível obter o id da OS no Supabase após salvar'],
    }
  }

  const row = await relerServiceOrderDoSupabase(officeUuid, serviceOrderId)
  if (!row) {
    logSalvarOsDev({
      fallback_local: true,
      motivo: 'Releitura falhou',
      service_order_id: serviceOrderId,
    })
    return {
      ok: false,
      confirmadoSupabase: false,
      fallbackLocal: true,
      mensagem: MENSAGEM_OS_FALLBACK_LOCAL,
      erros: ['A OS não foi encontrada no Supabase após salvar'],
    }
  }

  limparPendenciasOsSalva(officeLocalId, os)

  logSalvarOsDev({
    confirmado_supabase: true,
    service_order_id: serviceOrderId,
    releitura: {
      id: row.id,
      number: row.number,
      customer_id: row.customer_id,
      motorcycle_id: row.motorcycle_id,
    },
    contagem: resultado.contagem,
    fallback_local: false,
  })

  return {
    ok: true,
    confirmadoSupabase: true,
    fallbackLocal: false,
    service_order_id: serviceOrderId,
    mensagem: opcoes?.eraNova ? MENSAGEM_OS_SALVA_SUPABASE : MENSAGEM_OS_ATUALIZADA_SUPABASE,
    erros: [],
  }
}
