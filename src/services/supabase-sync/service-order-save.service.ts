import { ehProvavelErroDeRede, aguardarMs } from '@/lib/network-error'
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

export const MENSAGEM_OS_SALVA_SUPABASE = MSG.salvo
export const MENSAGEM_OS_ATUALIZADA_SUPABASE = MSG.salvo
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

async function relerServiceOrderComRetry(
  officeUuid: string,
  serviceOrderId: string,
  tentativas = 3
): Promise<ServiceOrderRow | null> {
  for (let i = 0; i < tentativas; i++) {
    const row = await relerServiceOrderDoSupabase(officeUuid, serviceOrderId)
    if (row) return row
    if (i < tentativas - 1) await aguardarMs(250 * (i + 1))
  }
  return null
}

async function obterContextoOfficeComRetry(
  officeLocalId: string,
  tentativas = 2
): Promise<Awaited<ReturnType<typeof obterContextoOfficeSupabase>>> {
  for (let i = 0; i < tentativas; i++) {
    const contexto = await obterContextoOfficeSupabase(officeLocalId)
    if (contexto?.officeUuid) return contexto
    if (i < tentativas - 1) await aguardarMs(200)
  }
  return null
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

function resultadoErro(
  mensagem: string,
  erros: string[],
  opcoes?: { fallbackLocal?: boolean }
): ResultadoSalvarOsSupabase {
  return {
    ok: false,
    confirmadoSupabase: false,
    fallbackLocal: opcoes?.fallbackLocal ?? false,
    mensagem,
    erros,
  }
}

async function resolverServiceOrderIdAposPersistencia(
  os: OrdemServico,
  officeUuid: string
): Promise<string | undefined> {
  let serviceOrderId = obterUuidPorLocalId(os.id)
  if (serviceOrderId) return serviceOrderId

  serviceOrderId = (await vincularOsExistentePorNumero(os, officeUuid)) ?? undefined
  if (serviceOrderId) {
    registrarMapeamentoId(os.id, serviceOrderId)
    return serviceOrderId
  }

  const porNumero = await buscarOsSupabasePorNumero(officeUuid, os.numero)
  if (porNumero) {
    serviceOrderId = String(porNumero.id)
    registrarMapeamentoId(os.id, serviceOrderId)
    return serviceOrderId
  }

  return undefined
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
  const mensagemSucesso = opcoes?.eraNova ? MENSAGEM_OS_SALVA_SUPABASE : MENSAGEM_OS_ATUALIZADA_SUPABASE

  if (getCraftPersistenceMode() !== 'supabase') {
    return {
      ok: true,
      confirmadoSupabase: false,
      fallbackLocal: false,
      mensagem: mensagemSucesso,
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

  const contexto = await obterContextoOfficeComRetry(officeLocalId)
  if (!contexto?.officeUuid) {
    logDetalheTecnicoDev('OS save — sem office_id', { officeLocalId })
    return resultadoErro(MSG.erroSalvar, ['Usuário sem office_id vinculado no Supabase'])
  }

  const officeUuid = contexto.officeUuid
  const parcial = extrairDadosFase1ParaOs(dados, os.id)
  if (!parcial) {
    return resultadoErro(MSG.erroSalvar, ['OS não encontrada nos dados locais'])
  }

  const cliente = parcial.clientes[0]
  const moto = parcial.motos[0]

  if (!cliente || !moto) {
    return resultadoErro(MSG.erroSalvar, ['Cliente ou moto da OS não encontrados nos dados locais'])
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

  let resultado: Awaited<ReturnType<typeof persistirFase1NoSupabase>>
  try {
    resultado = await persistirFase1NoSupabase(officeUuid, fase1, {
      ...contexto.opcoes,
      pularOficina: true,
    })
  } catch (err) {
    logDetalheTecnicoDev('OS persist exception', err)
    const offline = ehProvavelErroDeRede(undefined, err)
    return {
      ok: offline,
      confirmadoSupabase: false,
      fallbackLocal: offline,
      mensagem: offline ? MENSAGEM_OS_FALLBACK_LOCAL : MSG.erroSalvar,
      erros: [err instanceof Error ? err.message : 'Erro ao salvar no Supabase'],
    }
  }

  const osErro = resultado.erros.find(
    (e) => e.id === os.id && e.entidade === 'Ordem de Serviço'
  )
  if (osErro) {
    logDetalheTecnicoDev('OS erro persistência', osErro)
    const offline = ehProvavelErroDeRede(osErro.mensagem)
    return {
      ok: false,
      confirmadoSupabase: false,
      fallbackLocal: offline,
      mensagem: offline ? MENSAGEM_OS_FALLBACK_LOCAL : MSG.erroSalvar,
      erros: [osErro.mensagem, ...resultado.avisos],
    }
  }

  const osPersistida =
    resultado.contagem.service_orders > 0 ||
    (!osErro && resultado.enviados > 0 && fase1.ordens_servico.some((o) => o.id === os.id))

  const serviceOrderId = await resolverServiceOrderIdAposPersistencia(os, officeUuid)

  if (!serviceOrderId && !osPersistida) {
    logSalvarOsDev({
      motivo: 'UUID da OS não resolvido após persistência',
      contagem: resultado.contagem,
      erros: resultado.erros,
    })
    return resultadoErro(MSG.erroSalvar, ['Não foi possível confirmar a OS no Supabase após salvar'])
  }

  if (serviceOrderId) {
    const row = await relerServiceOrderComRetry(officeUuid, serviceOrderId)
    if (!row && !osPersistida) {
      logSalvarOsDev({
        motivo: 'Releitura falhou',
        service_order_id: serviceOrderId,
      })
      const offline = false
      return {
        ok: false,
        confirmadoSupabase: false,
        fallbackLocal: offline,
        mensagem: MSG.erroSalvar,
        erros: ['A OS não foi encontrada no Supabase após salvar'],
      }
    }
  }

  limparPendenciasOsSalva(officeLocalId, os)

  logSalvarOsDev({
    confirmado_supabase: true,
    service_order_id: serviceOrderId,
    contagem: resultado.contagem,
    fallback_local: false,
  })

  return {
    ok: true,
    confirmadoSupabase: true,
    fallbackLocal: false,
    service_order_id: serviceOrderId,
    mensagem: mensagemSucesso,
    erros: [],
  }
}
