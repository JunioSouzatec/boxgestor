import { getCraftPersistenceMode, getSupabaseClient } from '@/lib/supabase'
import { MSG } from '@/lib/mensagens-usuario'
import { localIdParaUuid } from '@/lib/local-id-uuid'
import {
  aplicarOfficeUuidEmDadosFase1,
  obterContextoOfficeSupabase,
  type ContextoOfficeSupabase,
} from '@/lib/supabase-office-context'
import { obterUuidPorLocalId, registrarMapeamentoId } from '@/services/supabase-sync/id-registry'
import {
  buscarOsSupabasePorUuid,
  MENSAGEM_OS_NAO_TOTALMENTE_SINCRONIZADA,
  resolverIdsPagamentoDaOsSupabase,
} from '@/services/pagamentos/payment-fk-resolver.service'
import {
  osExisteNoSupabasePorId,
  sincronizarOsPendentesNoSupabase,
  vincularOsExistentePorNumero,
} from '@/services/supabase-sync/payment-os-sync.service'
import {
  extrairDadosFase1ParaOs,
  persistirFase1NoSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import { salvarOsComConfirmacaoSupabase } from '@/services/supabase-sync/service-order-save.service'
import type { CraftDatabase } from '@/types/database'
import type { OrdemServico } from '@/types/ordem-servico'

export interface DiagnosticoPagamentoLog {
  tabela: string
  office_id: string
  current_office_id?: string | null
  service_order_id?: string
  customer_id?: string | null
  motorcycle_id?: string | null
  amount?: number
  payment_method?: string
  payload: Record<string, unknown>
  erro?: {
    codigo?: string
    mensagem?: string
    detalhe?: string
    hint?: string
  }
}

export interface DiagnosticoOsPagamento {
  os_local_id: string
  os_numero: number
  office_id: string
  office_uuid?: string
  os_uuid_mapeado?: string
  os_supabase_id?: string
  service_order_id?: string
  customer_id_local: string
  motorcycle_id_local: string
  customer_id_supabase?: string | null
  motorcycle_id_supabase?: string | null
  existe_no_supabase: boolean
  estrategia?: string
}

export const MENSAGEM_SALVE_OS_ANTES_UI = MSG.salveOsAntesPagamento

export const MENSAGEM_OS_ANTES_PAGAMENTO = MSG.salveOsAntesPagamento

export const MENSAGEM_OS_FALHA_SALVAR = MSG.erroSalvar

export const MENSAGEM_OS_SALVA_PAGAMENTO_LIBERADO = MSG.osSalva

export const MENSAGEM_OS_E_PAGAMENTO_SUCESSO = MSG.osEPagamentoRegistrados

export interface OsSupabaseMeta {
  service_order_id: string
  supabase_id: string
}

export async function obterCurrentOfficeIdRpc(): Promise<string | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data, error } = await supabase.rpc('current_office_id')
  if (error) {
    console.warn('[Craft Supabase] RPC current_office_id falhou:', error.message)
    return null
  }
  return data as string | null
}

export async function resolverUuidOs(osId: string): Promise<string> {
  return obterUuidPorLocalId(osId) ?? (await localIdParaUuid(osId))
}

function logDiagnosticoOsDev(diag: DiagnosticoOsPagamento): void {
  if (!import.meta.env.DEV) return
  console.info('[Craft Supabase] Diagnóstico OS para pagamento', {
    'os.id': diag.os_local_id,
    'os.local_id': diag.os_local_id,
    'os.supabase_id': diag.os_supabase_id,
    'os.service_order_id': diag.service_order_id,
    'os.number': diag.os_numero,
    office_id: diag.office_id,
    office_uuid: diag.office_uuid,
    customer_id: diag.customer_id_supabase,
    motorcycle_id: diag.motorcycle_id_supabase,
    customer_id_local: diag.customer_id_local,
    motorcycle_id_local: diag.motorcycle_id_local,
    os_existe_supabase: diag.existe_no_supabase,
    estrategia: diag.estrategia,
  })
}

/** Verifica se a OS já está no Supabase (id mapeado, UUID determinístico ou número+office) */
export async function resolverOsSalvaNoSupabase(
  officeUuid: string,
  os: OrdemServico
): Promise<{
  salva: boolean
  service_order_id?: string
  estrategia: string
  customer_id?: string | null
  motorcycle_id?: string | null
}> {
  const uuidMapeado = obterUuidPorLocalId(os.id)
  if (uuidMapeado && (await osExisteNoSupabasePorId(officeUuid, uuidMapeado))) {
    const row = await buscarOsSupabasePorUuid(officeUuid, uuidMapeado)
    return {
      salva: true,
      service_order_id: uuidMapeado,
      estrategia: 'id_registry',
      customer_id: row?.customer_id,
      motorcycle_id: row?.motorcycle_id,
    }
  }

  const vinculada = await vincularOsExistentePorNumero(os, officeUuid)
  if (vinculada) {
    const row = await buscarOsSupabasePorUuid(officeUuid, vinculada)
    return {
      salva: true,
      service_order_id: vinculada,
      estrategia: 'numero_office',
      customer_id: row?.customer_id,
      motorcycle_id: row?.motorcycle_id,
    }
  }

  const uuidDeterministico = await localIdParaUuid(os.id)
  if (await osExisteNoSupabasePorId(officeUuid, uuidDeterministico)) {
    registrarMapeamentoId(os.id, uuidDeterministico)
    const row = await buscarOsSupabasePorUuid(officeUuid, uuidDeterministico)
    return {
      salva: true,
      service_order_id: uuidDeterministico,
      estrategia: 'uuid_deterministico',
      customer_id: row?.customer_id,
      motorcycle_id: row?.motorcycle_id,
    }
  }

  return { salva: false, estrategia: 'nao_encontrada' }
}

/** Diagnóstico completo antes de bloquear/liberar pagamento */
export async function diagnosticarOsParaPagamento(
  officeLocalId: string,
  os: OrdemServico,
  _dados?: CraftDatabase
): Promise<DiagnosticoOsPagamento | null> {
  if (getCraftPersistenceMode() !== 'supabase') {
    return {
      os_local_id: os.id,
      os_numero: os.numero,
      office_id: officeLocalId,
      customer_id_local: os.cliente_id,
      motorcycle_id_local: os.moto_id,
      existe_no_supabase: true,
      estrategia: 'modo_local',
    }
  }

  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  if (!contexto?.officeUuid) {
    const diag: DiagnosticoOsPagamento = {
      os_local_id: os.id,
      os_numero: os.numero,
      office_id: officeLocalId,
      customer_id_local: os.cliente_id,
      motorcycle_id_local: os.moto_id,
      existe_no_supabase: false,
      estrategia: 'sem_office_uuid',
    }
    logDiagnosticoOsDev(diag)
    return diag
  }

  const resolucao = await resolverOsSalvaNoSupabase(contexto.officeUuid, os)
  const diag: DiagnosticoOsPagamento = {
    os_local_id: os.id,
    os_numero: os.numero,
    office_id: officeLocalId,
    office_uuid: contexto.officeUuid,
    os_uuid_mapeado: obterUuidPorLocalId(os.id),
    os_supabase_id: resolucao.service_order_id,
    service_order_id: resolucao.service_order_id,
    customer_id_local: os.cliente_id,
    motorcycle_id_local: os.moto_id,
    customer_id_supabase: resolucao.customer_id,
    motorcycle_id_supabase: resolucao.motorcycle_id,
    existe_no_supabase: resolucao.salva,
    estrategia: resolucao.estrategia,
  }
  logDiagnosticoOsDev(diag)
  return diag
}

/** Aguarda OS aparecer no Supabase após salvar (persistência assíncrona) */
export async function aguardarOsNoSupabase(
  officeLocalId: string,
  os: OrdemServico,
  tentativas = 6,
  intervaloMs = 400
): Promise<DiagnosticoOsPagamento | null> {
  for (let i = 0; i < tentativas; i++) {
    const diag = await diagnosticarOsParaPagamento(officeLocalId, os)
    if (diag?.existe_no_supabase) return diag
    if (i < tentativas - 1) {
      await new Promise((r) => setTimeout(r, intervaloMs))
    }
  }
  return diagnosticarOsParaPagamento(officeLocalId, os)
}

/** @deprecated Use resolverOsSalvaNoSupabase */
export async function osExisteNoSupabase(
  officeUuid: string,
  osLocalId: string,
  osNumero?: number
): Promise<boolean> {
  const osStub = {
    id: osLocalId,
    numero: osNumero ?? 0,
    cliente_id: '',
    moto_id: '',
  } as OrdemServico
  const res = await resolverOsSalvaNoSupabase(officeUuid, osStub)
  return res.salva
}

/** Sincroniza OS + cliente + moto antes de registrar pagamento */
export async function garantirOsNoSupabaseParaPagamento(
  officeLocalId: string,
  officeUuid: string,
  os: OrdemServico,
  dados: CraftDatabase,
  contexto?: ContextoOfficeSupabase | null
): Promise<{ ok: boolean; osUuid?: string; mensagem?: string }> {
  const existente = await resolverOsSalvaNoSupabase(officeUuid, os)
  if (existente.salva && existente.service_order_id) {
    return { ok: true, osUuid: existente.service_order_id }
  }

  console.info('[Craft Supabase] OS ausente no Supabase — sincronizando antes do pagamento', {
    os_local: os.id,
    os_numero: os.numero,
    office_id: officeUuid,
  })

  const syncResult = await sincronizarOsPendentesNoSupabase(officeLocalId, dados, [os.id])
  if (!syncResult.ok && syncResult.erros.length > 0) {
    const parcial = extrairDadosFase1ParaOs(dados, os.id)
    if (parcial) {
      const fase1 = aplicarOfficeUuidEmDadosFase1(parcial, officeUuid)
      const resultado = await persistirFase1NoSupabase(officeUuid, fase1, contexto?.opcoes)
      const osOk =
        resultado.contagem.service_orders > 0 ||
        !resultado.erros.some((e) => e.id === os.id && e.entidade === 'Ordem de Serviço')
      if (!osOk && resultado.erros.length > 0) {
        console.error('[Craft Supabase] Falha ao sincronizar OS antes do pagamento', {
          erros: resultado.erros,
          os_id: os.id,
        })
        return { ok: false, mensagem: MENSAGEM_OS_FALHA_SALVAR }
      }
    }
  }

  const aposSync = await resolverOsSalvaNoSupabase(officeUuid, os)
  if (aposSync.salva && aposSync.service_order_id) {
    return { ok: true, osUuid: aposSync.service_order_id }
  }

  return { ok: false, mensagem: MENSAGEM_OS_FALHA_SALVAR }
}

/** Aguarda a OS aparecer no Supabase logo após salvar localmente */
export async function sincronizarOsAposSalvarLocal(
  officeLocalId: string,
  os: OrdemServico,
  dados: CraftDatabase
): Promise<{ ok: boolean; service_order_id?: string; meta?: OsSupabaseMeta; mensagem?: string }> {
  const resultado = await salvarOsComConfirmacaoSupabase(officeLocalId, os, dados)
  if (!resultado.ok || !resultado.confirmadoSupabase) {
    return { ok: false, mensagem: resultado.mensagem }
  }
  const meta: OsSupabaseMeta | undefined = resultado.service_order_id
    ? { service_order_id: resultado.service_order_id, supabase_id: resultado.service_order_id }
    : undefined
  return { ok: true, service_order_id: resultado.service_order_id, meta }
}

/** Garante OS no Supabase antes de criar pagamento (exceto offline real) */
export async function validarOsParaRegistrarPagamento(
  officeLocalId: string,
  os: OrdemServico,
  dados: CraftDatabase,
  offline: boolean
): Promise<{ ok: boolean; mensagem?: string }> {
  if (getCraftPersistenceMode() !== 'supabase') return { ok: true }
  if (offline) return { ok: true }

  await diagnosticarOsParaPagamento(officeLocalId, os, dados)

  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  if (!contexto) {
    return { ok: false, mensagem: MENSAGEM_OS_FALHA_SALVAR }
  }

  const resultado = await garantirOsNoSupabaseParaPagamento(
    officeLocalId,
    contexto.officeUuid,
    os,
    dados,
    contexto
  )

  if (!resultado.ok) {
    return { ok: false, mensagem: resultado.mensagem ?? MENSAGEM_OS_FALHA_SALVAR }
  }

  const idsResolvidos = await resolverIdsPagamentoDaOsSupabase(
    contexto.officeUuid,
    os,
    dados,
    contexto,
    true
  )

  if (!idsResolvidos.ok) {
    return { ok: false, mensagem: MENSAGEM_OS_NAO_TOTALMENTE_SINCRONIZADA }
  }

  if (idsResolvidos.ids.customer_id && !idsResolvidos.ids.customer_existe) {
    return { ok: false, mensagem: MENSAGEM_OS_NAO_TOTALMENTE_SINCRONIZADA }
  }

  if (import.meta.env.DEV) {
    console.info('[Craft Supabase] OS validada para pagamento', {
      service_order_id: idsResolvidos.ids.service_order_id,
      customer_id: idsResolvidos.ids.customer_id,
      motorcycle_id: idsResolvidos.ids.motorcycle_id,
    })
  }

  return { ok: true }
}

export async function logDiagnosticoPagamento(log: DiagnosticoPagamentoLog): Promise<void> {
  const currentOfficeId = log.current_office_id ?? (await obterCurrentOfficeIdRpc())

  const completo = { ...log, current_office_id: currentOfficeId }

  console.error('[Craft Supabase] Erro ao registrar pagamento', completo)

  if (import.meta.env.DEV && log.erro) {
    console.table({
      tabela: log.tabela,
      office_id: log.office_id,
      current_office_id: currentOfficeId,
      service_order_id: log.service_order_id,
      customer_id: log.customer_id,
      motorcycle_id: log.motorcycle_id,
      amount: log.amount,
      payment_method: log.payment_method,
      erro: log.erro.mensagem,
      codigo: log.erro.codigo,
    })
  }
}
