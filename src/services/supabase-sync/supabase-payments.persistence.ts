import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { SyncIdMap } from '@/services/supabase-sync/mappers'
import { registrarMapeamentoId } from '@/services/supabase-sync/id-registry'
import { semearSyncIdMapDoRegistry } from '@/services/supabase-sync/service-order-supabase.helpers'
import {
  classificarErroPagamento,
  MENSAGEM_CLIENTE_MOTO_PENDENTE,
  MENSAGEM_DUPLICIDADE_EVITADA,
  MENSAGEM_OS_NAO_SINCRONIZADA,
  MENSAGEM_SUCESSO_OS_E_PAGAMENTO,
  MENSAGEM_SUCESSO_PAGAMENTO,
  mensagemPagamentoParaUsuario,
} from '@/services/supabase-sync/payment-error-messages'
import { resolverIdsPagamentoDaOsSupabase } from '@/services/pagamentos/payment-fk-resolver.service'
import {
  mesclarLancamentosSemDuplicata,
  obterClientPaymentId,
  precisaSincronizarPagamento,
} from '@/services/pagamentos/payment-dedupe.helpers'
import {
  isIdFallbackImportado,
  marcarLancamentoComoOrfao,
} from '@/services/pagamentos/payment-orphan.service'
import {
  garantirOsNoSupabaseParaPagamento,
  logDiagnosticoPagamento,
  obterCurrentOfficeIdRpc,
  resolverUuidOs,
} from '@/services/supabase-sync/payment-sync.helpers'
import {
  logDiagnosticoVinculoPagamento,
  resolverOsParaPagamento,
} from '@/services/supabase-sync/payment-os-resolver'
import {
  garantirOsParaPagamentosPendentes,
  diagnosticarPagamentoPendenteCompleto,
} from '@/services/supabase-sync/payment-os-sync.service'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import {
  ehPagamentoOS,
  mapearFinancialTransaction,
  mapearFinancialTransactionReverso,
  mapearServiceOrderPayment,
  mapearServiceOrderPaymentReverso,
  type FinancialTransactionRow,
  type ServiceOrderPaymentRow,
} from '@/services/supabase-sync/payment-mappers'
import type { SyncErro } from '@/services/supabase-sync/supabase-sync.types'
import type { CraftDatabase } from '@/types/database'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'

export {
  MENSAGEM_SUCESSO_PAGAMENTO,
  MENSAGEM_SUCESSO_OS_E_PAGAMENTO,
  MENSAGEM_DUPLICIDADE_EVITADA,
  MENSAGEM_OS_NAO_SINCRONIZADA,
} from '@/services/supabase-sync/payment-error-messages'

export const MENSAGEM_FALLBACK_PAGAMENTO =
  'Pagamento salvo localmente e será sincronizado depois.'

export interface ResultadoPersistenciaPagamentos {
  ok: boolean
  erros: SyncErro[]
  enviados: number
  contagem: {
    service_order_payments: number
    financial_transactions: number
  }
  /** IDs de lançamentos sincronizados nesta execução */
  sincronizados_ids: string[]
  /** Correções de ordem_servico_id em pagamentos com vínculo desatualizado */
  correcoes_os: Array<{
    lancamento_id: string
    ordem_servico_id_anterior?: string
    ordem_servico_id_novo: string
  }>
  /** Pagamentos já existentes no Supabase (idempotência) */
  duplicatas_evitadas_ids: string[]
  /** Atualizações para gravar no localStorage após sync */
  sync_atualizados: Array<{
    lancamento_id: string
    payment_supabase_id: string
    client_payment_id: string
  }>
  /** Pagamentos sem OS — não reenviar */
  orfaos_marcados: Array<{
    lancamento_id: string
    motivo: string
  }>
}

export interface ResultadoCarregamentoPagamentos {
  ok: boolean
  lancamentos: LancamentoFinanceiro[]
  erros: SyncErro[]
}

interface ContextoUpsertPagamento {
  officeUuid: string
  currentOfficeId?: string | null
  lancamentoId?: string
  osLocalId?: string
}

function sanitizarLinhaParaSupabase(linha: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(linha)) {
    if (valor !== undefined) out[chave] = valor
  }
  return out
}

function mapaOsPorId(ordens: OrdemServico[]): Map<string, OrdemServico> {
  return new Map(ordens.map((os) => [os.id, os]))
}

function semearIdsPagamentos(
  ids: SyncIdMap,
  officeLocalId: string,
  officeUuid: string,
  dados: CraftDatabase
): void {
  ids.seed(officeLocalId, officeUuid)
  const locais = [
    ...dados.clientes.map((c) => c.id),
    ...dados.motos.map((m) => m.id),
    ...dados.ordens_servico.map((os) => os.id),
    ...dados.ordens_servico.map((os) => os.cliente_id),
    ...dados.ordens_servico.map((os) => os.moto_id),
    ...dados.lancamentos.map((l) => l.id),
    ...dados.lancamentos.flatMap((l) =>
      l.ordem_servico_id ? [l.ordem_servico_id, `fin:${l.id}`, `pay:${l.id}`] : [`fin:${l.id}`]
    ),
  ]
  semearSyncIdMapDoRegistry(ids, locais)
}

async function upsertLinha(
  tabela: 'financial_transactions' | 'service_order_payments',
  linha: Record<string, unknown>,
  entidade: string,
  erros: SyncErro[],
  contexto: ContextoUpsertPagamento
): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  const payload = sanitizarLinhaParaSupabase(linha)
  const currentOfficeId = contexto.currentOfficeId ?? (await obterCurrentOfficeIdRpc())

  if (import.meta.env.DEV) {
    console.info(`[Craft Supabase] UPSERT ${tabela}`, {
      office_id: contexto.officeUuid,
      current_office_id: currentOfficeId,
      service_order_id: payload.service_order_id,
      customer_id: payload.customer_id,
      motorcycle_id: payload.motorcycle_id,
      amount: payload.amount,
      payment_method: payload.payment_method,
      payload,
    })
  }

  const { error } = await supabase.from(tabela).upsert(payload as never, { onConflict: 'id' })

  if (!error) return true

  const codigo = classificarErroPagamento(error)
  const mensagemUsuario = mensagemPagamentoParaUsuario(codigo, tabela)

  await logDiagnosticoPagamento({
    tabela,
    office_id: contexto.officeUuid,
    current_office_id: currentOfficeId,
    service_order_id: payload.service_order_id as string | undefined,
    customer_id: payload.customer_id as string | null | undefined,
    motorcycle_id: payload.motorcycle_id as string | null | undefined,
    amount: payload.amount as number | undefined,
    payment_method: payload.payment_method as string | undefined,
    payload,
    erro: {
      codigo: error.code,
      mensagem: error.message,
      detalhe: error.details,
      hint: error.hint,
    },
  })

  erros.push({
    entidade,
    id: contexto.lancamentoId ?? String(linha.id ?? ''),
    mensagem: mensagemUsuario,
  })

  registrarUltimoErroSupabase({
    mensagem: error.message,
    entidade: tabela,
    codigo: error.code,
    erro_tecnico: `${error.message}${error.details ? ` — ${error.details}` : ''}`,
    service_order: {
      office_id: contexto.officeUuid,
      customer_id: String(payload.customer_id ?? ''),
      motorcycle_id: String(payload.motorcycle_id ?? ''),
      os_local_id: contexto.osLocalId,
      current_office_id: currentOfficeId,
    },
  })

  return false
}

async function carregarIdsOsValidos(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  officeUuid: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from('service_orders')
    .select('id')
    .eq('office_id', officeUuid)

  return new Set((data ?? []).map((r: { id: string }) => String(r.id)))
}

async function pagamentoJaExisteNoSupabase(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  officeUuid: string,
  osUuid: string,
  lancamento: LancamentoFinanceiro
): Promise<string | null> {
  const clientPaymentId = obterClientPaymentId(lancamento)

  const { data: byClientId } = await supabase
    .from('service_order_payments')
    .select('id')
    .eq('office_id', officeUuid)
    .eq('service_order_id', osUuid)
    .eq('client_payment_id', clientPaymentId)
    .maybeSingle<{ id: string }>()

  if (byClientId?.id) return String(byClientId.id)

  const { data: byMeta } = await supabase
    .from('service_order_payments')
    .select('id')
    .eq('office_id', officeUuid)
    .filter('craft_meta->>local_id', 'eq', lancamento.id)
    .maybeSingle<{ id: string }>()

  if (byMeta?.id) return String(byMeta.id)

  const { data: byMetaClient } = await supabase
    .from('service_order_payments')
    .select('id')
    .eq('office_id', officeUuid)
    .filter('craft_meta->>client_payment_id', 'eq', clientPaymentId)
    .maybeSingle<{ id: string }>()

  if (byMetaClient?.id) return String(byMetaClient.id)

  return null
}

async function lancamentoFinanceiroJaExisteNoSupabase(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  officeUuid: string,
  lancamento: LancamentoFinanceiro,
  serviceOrderPaymentUuid?: string | null
): Promise<string | null> {
  const clientPaymentId = obterClientPaymentId(lancamento)

  if (serviceOrderPaymentUuid) {
    const { data: byPayLink } = await supabase
      .from('financial_transactions')
      .select('id')
      .eq('office_id', officeUuid)
      .eq('service_order_payment_id', serviceOrderPaymentUuid)
      .maybeSingle<{ id: string }>()
    if (byPayLink?.id) return String(byPayLink.id)
  }

  const { data: byClient } = await supabase
    .from('financial_transactions')
    .select('id')
    .eq('office_id', officeUuid)
    .eq('client_payment_id', clientPaymentId)
    .maybeSingle<{ id: string }>()

  if (byClient?.id) return String(byClient.id)

  const { data: byMeta } = await supabase
    .from('financial_transactions')
    .select('id')
    .eq('office_id', officeUuid)
    .filter('craft_meta->>local_id', 'eq', lancamento.id)
    .maybeSingle<{ id: string }>()

  return byMeta?.id ? String(byMeta.id) : null
}

async function vincularPagamentoAoFinanceiro(
  payId: string,
  finUuid: string
): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  const { error } = await supabase
    .from('service_order_payments')
    .update({
      financial_transaction_id: finUuid,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', payId)

  if (error) {
    console.warn('[Craft Supabase] Pagamento salvo; vínculo financeiro pendente:', error.message)
    return false
  }

  return true
}

async function persistirLancamentoOS(
  lancamento: LancamentoFinanceiro,
  os: OrdemServico,
  officeUuid: string,
  officeLocalId: string,
  dados: CraftDatabase,
  ids: SyncIdMap,
  createdBy: string | null | undefined,
  osValidas: Set<string>,
  erros: SyncErro[],
  contextoAuth: Awaited<ReturnType<typeof obterContextoOfficeSupabase>>
): Promise<{ status: 'ok' | 'duplicata' | 'erro' | 'orfao'; payment_supabase_id?: string; motivo?: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { status: 'erro' }

  const valor = Number(lancamento.valor)
  if (!Number.isFinite(valor) || valor <= 0) {
    erros.push({
      entidade: 'Pagamento OS',
      id: lancamento.id,
      mensagem: mensagemPagamentoParaUsuario('payload', 'service_order_payments'),
    })
    return { status: 'erro' }
  }

  let osUuid = await ids.uuid(os.id)

  if (!osValidas.has(osUuid)) {
    const garantia = await garantirOsNoSupabaseParaPagamento(
      officeLocalId,
      officeUuid,
      os,
      dados,
      contextoAuth
    )
    if (!garantia.ok) {
      erros.push({
        entidade: 'Pagamento OS',
        id: lancamento.id,
        mensagem: MENSAGEM_OS_NAO_SINCRONIZADA,
      })
      console.warn('[Craft Supabase] Pagamento bloqueado — OS não sincronizada', {
        lancamento_id: lancamento.id,
        os_local: os.id,
        office_id: officeUuid,
      })
      return { status: 'erro' }
    }
    osUuid = garantia.osUuid ?? osUuid
    osValidas.add(osUuid)
  }

  const idsResolvidos = await resolverIdsPagamentoDaOsSupabase(
    officeUuid,
    os,
    dados,
    contextoAuth,
    true
  )

  if (!idsResolvidos.ok) {
    erros.push({
      entidade: 'Pagamento OS',
      id: lancamento.id,
      mensagem: idsResolvidos.motivo,
    })
    return { status: 'orfao', motivo: idsResolvidos.motivo }
  }

  const idsSupabase = idsResolvidos.ids
  osUuid = idsSupabase.service_order_id
  osValidas.add(osUuid)

  const ctxBase: ContextoUpsertPagamento = {
    officeUuid,
    lancamentoId: lancamento.id,
    osLocalId: os.id,
  }

  const payRow = await mapearServiceOrderPayment(
    lancamento,
    officeUuid,
    ids,
    os,
    null,
    createdBy,
    idsSupabase
  )
  const payId = String(payRow.id)

  const existente = await pagamentoJaExisteNoSupabase(
    supabase,
    officeUuid,
    osUuid,
    lancamento
  )
  if (existente) {
    console.info('[Craft Supabase] Pagamento já existe no Supabase — duplicidade evitada', {
      lancamento_id: lancamento.id,
      client_payment_id: obterClientPaymentId(lancamento),
      payment_id: existente,
    })
    registrarMapeamentoId(`pay:${lancamento.id}`, existente)
    return { status: 'duplicata', payment_supabase_id: existente }
  }

  const payOk = await upsertLinha(
    'service_order_payments',
    { ...payRow, financial_transaction_id: null },
    'Pagamento OS',
    erros,
    ctxBase
  )
  if (!payOk) {
    const ultimo = erros[erros.length - 1]
    if (ultimo?.mensagem === MENSAGEM_CLIENTE_MOTO_PENDENTE) {
      return { status: 'orfao', motivo: ultimo.mensagem }
    }
    return { status: 'erro' }
  }

  const finExistente = await lancamentoFinanceiroJaExisteNoSupabase(
    supabase,
    officeUuid,
    lancamento,
    payId
  )
  if (finExistente) {
    await vincularPagamentoAoFinanceiro(payId, finExistente)
    registrarMapeamentoId(lancamento.id, finExistente)
    registrarMapeamentoId(`pay:${lancamento.id}`, payId)
    return { status: 'ok', payment_supabase_id: payId }
  }

  const finRow = await mapearFinancialTransaction(lancamento, officeUuid, ids, os, payId, {
    service_order_id: idsSupabase.service_order_id,
    customer_id: idsSupabase.customer_id,
  })
  const finOk = await upsertLinha(
    'financial_transactions',
    finRow,
    'Lançamento financeiro',
    erros,
    ctxBase
  )

  if (!finOk) {
    console.warn('[Craft Supabase] Pagamento salvo; lançamento financeiro pendente', {
      lancamento_id: lancamento.id,
      payment_id: payId,
    })
    registrarMapeamentoId(`pay:${lancamento.id}`, payId)
    return { status: 'ok', payment_supabase_id: payId }
  }

  const finUuid = String(finRow.id)
  await vincularPagamentoAoFinanceiro(payId, finUuid)
  registrarMapeamentoId(lancamento.id, finUuid)
  registrarMapeamentoId(`pay:${lancamento.id}`, payId)

  return { status: 'ok', payment_supabase_id: payId }
}

async function persistirLancamentoGeral(
  lancamento: LancamentoFinanceiro,
  officeUuid: string,
  ids: SyncIdMap,
  ordens: Map<string, OrdemServico>,
  osValidas: Set<string>,
  erros: SyncErro[],
  ctxBase: ContextoUpsertPagamento
): Promise<boolean> {
  const os = lancamento.ordem_servico_id
    ? ordens.get(lancamento.ordem_servico_id)
    : undefined

  if (lancamento.ordem_servico_id && os) {
    const osUuid = await ids.uuid(os.id)
    if (!osValidas.has(osUuid)) {
      erros.push({
        entidade: 'Lançamento financeiro',
        id: lancamento.id,
        mensagem: MENSAGEM_OS_NAO_SINCRONIZADA,
      })
      return false
    }
  }

  const finRow = await mapearFinancialTransaction(lancamento, officeUuid, ids, os ?? null)
  return upsertLinha(
    'financial_transactions',
    finRow,
    'Lançamento financeiro',
    erros,
    { ...ctxBase, lancamentoId: lancamento.id }
  )
}

export async function persistirPagamentosNoSupabase(
  officeLocalId: string,
  dados: CraftDatabase,
  opcoes?: {
    createdBy?: string | null
    officeUuid?: string
    lancamentoIds?: string[]
    sincronizarDependencias?: boolean
  }
): Promise<ResultadoPersistenciaPagamentos> {
  const erros: SyncErro[] = []
  const contagem = { service_order_payments: 0, financial_transactions: 0 }
  const sincronizados_ids: string[] = []
  const correcoes_os: ResultadoPersistenciaPagamentos['correcoes_os'] = []
  const duplicatas_evitadas_ids: string[] = []
  const sync_atualizados: ResultadoPersistenciaPagamentos['sync_atualizados'] = []
  const orfaos_marcados: ResultadoPersistenciaPagamentos['orfaos_marcados'] = []

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      erros: [{ entidade: 'conexão', mensagem: 'Supabase não configurado' }],
      enviados: 0,
      contagem,
      sincronizados_ids,
      correcoes_os,
      duplicatas_evitadas_ids,
      sync_atualizados,
      orfaos_marcados,
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      erros: [{ entidade: 'conexão', mensagem: 'Cliente Supabase indisponível' }],
      enviados: 0,
      contagem,
      sincronizados_ids,
      correcoes_os,
      duplicatas_evitadas_ids,
      sync_atualizados,
      orfaos_marcados,
    }
  }

  const contextoAuth = await obterContextoOfficeSupabase(officeLocalId)
  const officeUuid = opcoes?.officeUuid ?? contextoAuth?.officeUuid ?? officeLocalId
  const createdBy = opcoes?.createdBy ?? contextoAuth?.userId ?? null
  const currentOfficeId = await obterCurrentOfficeIdRpc()

  if (
    opcoes?.lancamentoIds &&
    opcoes.lancamentoIds.length > 0 &&
    opcoes.sincronizarDependencias !== false
  ) {
    await garantirOsParaPagamentosPendentes(
      officeLocalId,
      dados,
      opcoes.lancamentoIds
    )
  }

  const ids = new SyncIdMap()
  semearIdsPagamentos(ids, officeLocalId, officeUuid, dados)

  const ordensMap = mapaOsPorId(dados.ordens_servico)
  let osValidas = await carregarIdsOsValidos(supabase, officeUuid)

  const idsFiltro = opcoes?.lancamentoIds ? new Set(opcoes.lancamentoIds) : null
  let enviados = 0

  for (const lancamento of dados.lancamentos) {
    if (lancamento.cancelado) continue
    if (lancamento.sync_orfao || lancamento.sync_arquivado) continue
    if (idsFiltro && !idsFiltro.has(lancamento.id)) continue
    if (!idsFiltro && !precisaSincronizarPagamento(lancamento)) continue
    if (!idsFiltro && lancamento.payment_supabase_id && !lancamento.sync_pendente) continue

    if (isIdFallbackImportado(lancamento.id) && !lancamento.payment_supabase_id) {
      orfaos_marcados.push({
        lancamento_id: lancamento.id,
        motivo: 'Lançamento importado do Supabase sem vínculo local válido (fin-/pay-)',
      })
      erros.push({
        entidade: 'Pagamento órfão',
        id: lancamento.id,
        mensagem: 'Sem OS vinculada — pendência marcada como órfã',
      })
      continue
    }

    const errosAntes = erros.length

    try {
      if (ehPagamentoOS(lancamento)) {
        const resolucao = await resolverOsParaPagamento(lancamento, dados, officeUuid)
        logDiagnosticoVinculoPagamento(resolucao.diagnostico)
        diagnosticarPagamentoPendenteCompleto(
          lancamento,
          dados,
          officeUuid,
          resolucao.diagnostico
        )

        if (!resolucao.os) {
          const motivoOrfao =
            resolucao.diagnostico.erro ?? MENSAGEM_OS_NAO_SINCRONIZADA
          console.error('[Craft Supabase] Pagamento órfão — OS não encontrada', {
            payment_id: lancamento.id,
            ordem_servico_id: lancamento.ordem_servico_id,
            office_id: officeUuid,
            os_local: resolucao.diagnostico.os_local_encontrada,
            os_supabase: resolucao.diagnostico.os_supabase_encontrada,
            erro_real: motivoOrfao,
          })
          orfaos_marcados.push({
            lancamento_id: lancamento.id,
            motivo: motivoOrfao,
          })
          erros.push({
            entidade: 'Pagamento OS',
            id: lancamento.id,
            mensagem: motivoOrfao,
          })
          continue
        }

        const os = resolucao.os
        if (lancamento.ordem_servico_id && lancamento.ordem_servico_id !== os.id) {
          correcoes_os.push({
            lancamento_id: lancamento.id,
            ordem_servico_id_anterior: lancamento.ordem_servico_id,
            ordem_servico_id_novo: os.id,
          })
          console.info('[Craft Supabase] Corrigindo vínculo pagamento → OS', {
            lancamento_id: lancamento.id,
            de: lancamento.ordem_servico_id,
            para: os.id,
          })
        }

        const resultadoOs = await persistirLancamentoOS(
          lancamento,
          os,
          officeUuid,
          officeLocalId,
          dados,
          ids,
          createdBy,
          osValidas,
          erros,
          contextoAuth
        )

        if (resultadoOs.status === 'ok' || resultadoOs.status === 'duplicata') {
          const paymentId =
            resultadoOs.payment_supabase_id ??
            lancamento.payment_supabase_id ??
            String(await ids.uuid(`pay:${lancamento.id}`))

          sync_atualizados.push({
            lancamento_id: lancamento.id,
            payment_supabase_id: paymentId,
            client_payment_id: obterClientPaymentId(lancamento),
          })
          sincronizados_ids.push(lancamento.id)

          if (resultadoOs.status === 'duplicata') {
            duplicatas_evitadas_ids.push(lancamento.id)
          } else {
            contagem.service_order_payments++
            contagem.financial_transactions++
            enviados += 2
          }
        } else if (resultadoOs.status === 'orfao') {
          orfaos_marcados.push({
            lancamento_id: lancamento.id,
            motivo:
              resultadoOs.motivo ??
              MENSAGEM_CLIENTE_MOTO_PENDENTE,
          })
        }
      } else {
        const ok = await persistirLancamentoGeral(
          lancamento,
          officeUuid,
          ids,
          ordensMap,
          osValidas,
          erros,
          { officeUuid, currentOfficeId, lancamentoId: lancamento.id }
        )
        if (ok) {
          contagem.financial_transactions++
          enviados++
          sincronizados_ids.push(lancamento.id)
          registrarMapeamentoId(lancamento.id, String(await ids.uuid(`fin:${lancamento.id}`)))
        }
      }
    } catch (e) {
      erros.push({
        entidade: 'Pagamento',
        id: lancamento.id,
        mensagem: e instanceof Error ? e.message : 'Erro ao sincronizar pagamento',
      })
    }

    if (erros.length === errosAntes && idsFiltro) {
      osValidas = await carregarIdsOsValidos(supabase, officeUuid)
    }
  }

  const alvo = idsFiltro ? opcoes!.lancamentoIds! : sincronizados_ids
  const idsOrfaos = new Set(orfaos_marcados.map((o) => o.lancamento_id))
  const okAlvo =
    alvo.length === 0
      ? erros.length === 0
      : alvo.every(
          (id) =>
            sincronizados_ids.includes(id) ||
            duplicatas_evitadas_ids.includes(id) ||
            idsOrfaos.has(id)
        )

  return {
    ok: okAlvo && erros.filter((e) => !e.id || !idsOrfaos.has(e.id)).length === 0,
    erros,
    enviados,
    contagem,
    sincronizados_ids,
    correcoes_os,
    duplicatas_evitadas_ids,
    sync_atualizados,
    orfaos_marcados,
  }
}

export async function persistirLancamentoUnicoNoSupabase(
  officeLocalId: string,
  lancamento: LancamentoFinanceiro,
  dados: CraftDatabase,
  createdBy?: string | null
): Promise<{ ok: boolean; mensagem?: string }> {
  const resultado = await persistirPagamentosNoSupabase(
    officeLocalId,
    { ...dados, lancamentos: [lancamento] },
    { createdBy, lancamentoIds: [lancamento.id] }
  )

  if (resultado.ok) {
    return {
      ok: true,
      mensagem: resultado.duplicatas_evitadas_ids.includes(lancamento.id)
        ? MENSAGEM_DUPLICIDADE_EVITADA
        : MENSAGEM_SUCESSO_PAGAMENTO,
    }
  }

  return {
    ok: false,
    mensagem: resultado.erros[0]?.mensagem ?? MENSAGEM_FALLBACK_PAGAMENTO,
  }
}

export async function carregarPagamentosDoSupabase(
  officeLocalId: string,
  officeUuid: string,
  baseLocal: CraftDatabase
): Promise<ResultadoCarregamentoPagamentos> {
  const erros: SyncErro[] = []

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      lancamentos: [],
      erros: [{ entidade: 'conexão', mensagem: 'Supabase não configurado' }],
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      lancamentos: [],
      erros: [{ entidade: 'conexão', mensagem: 'Cliente indisponível' }],
    }
  }

  try {
    const [paymentsRes, financialRes] = await Promise.all([
      supabase.from('service_order_payments').select('*').eq('office_id', officeUuid),
      supabase.from('financial_transactions').select('*').eq('office_id', officeUuid),
    ])

    if (paymentsRes.error) {
      erros.push({
        entidade: 'Pagamentos OS',
        mensagem: paymentsRes.error.message,
      })
    }
    if (financialRes.error) {
      erros.push({
        entidade: 'Financeiro',
        mensagem: financialRes.error.message,
      })
    }

    if (erros.length > 0 && !paymentsRes.data && !financialRes.data) {
      return { ok: false, lancamentos: [], erros }
    }

    const mapaOs = new Map<string, string>()
    for (const os of baseLocal.ordens_servico) {
      mapaOs.set(await resolverUuidOs(os.id), os.id)
    }

    const candidatos = baseLocal.lancamentos.map((l) => l.id)
    const porId = new Map<string, LancamentoFinanceiro>()

    for (const row of (paymentsRes.data ?? []) as ServiceOrderPaymentRow[]) {
      const item = await mapearServiceOrderPaymentReverso(row, officeLocalId, mapaOs, candidatos)
      if (item) porId.set(item.id, item)
    }

    for (const row of (financialRes.data ?? []) as FinancialTransactionRow[]) {
      if (row.service_order_id && row.type === 'receita') {
        continue
      }

      const meta = row.craft_meta as { local_id?: string; client_payment_id?: string } | undefined
      if (meta?.local_id && porId.has(meta.local_id)) continue
      if (meta?.client_payment_id && porId.has(meta.client_payment_id)) continue

      const item = await mapearFinancialTransactionReverso(row, officeLocalId, mapaOs, candidatos)
      if (item && !porId.has(item.id)) porId.set(item.id, item)
    }

    return { ok: true, lancamentos: Array.from(porId.values()), erros }
  } catch (e) {
    return {
      ok: false,
      lancamentos: [],
      erros: [
        {
          entidade: 'carregamento',
          mensagem: e instanceof Error ? e.message : 'Erro ao carregar pagamentos',
        },
      ],
    }
  }
}

export function mesclarLancamentos(
  local: LancamentoFinanceiro[],
  remoto: LancamentoFinanceiro[]
): LancamentoFinanceiro[] {
  return mesclarLancamentosSemDuplicata(local, remoto)
}

export function aplicarOrfaosPagamentosLocal(
  dados: CraftDatabase,
  orfaos: Array<{ lancamento_id: string; motivo: string }>
): CraftDatabase {
  if (orfaos.length === 0) return dados
  const mapa = new Map(orfaos.map((o) => [o.lancamento_id, o.motivo] as const))
  return {
    ...dados,
    lancamentos: dados.lancamentos.map((l) => {
      const motivo = mapa.get(l.id)
      if (!motivo) return l
      return marcarLancamentoComoOrfao(l, motivo)
    }),
  }
}

export function aplicarResultadoSyncPagamentosLocal(
  dados: CraftDatabase,
  resultado: Pick<
    ResultadoPersistenciaPagamentos,
    'correcoes_os' | 'sync_atualizados' | 'sincronizados_ids' | 'orfaos_marcados'
  >
): CraftDatabase {
  let db = dados

  if (resultado.correcoes_os.length > 0) {
    db = aplicarCorrecoesOsPagamentosLocal(db, resultado.correcoes_os)
  }

  if (resultado.orfaos_marcados && resultado.orfaos_marcados.length > 0) {
    db = aplicarOrfaosPagamentosLocal(db, resultado.orfaos_marcados)
  }

  if (resultado.sync_atualizados.length === 0) return db

  const syncMap = new Map(
    resultado.sync_atualizados.map((s) => [s.lancamento_id, s] as const)
  )
  const sincronizados = new Set(resultado.sincronizados_ids)

  return {
    ...db,
    lancamentos: db.lancamentos.map((l) => {
      const sync = syncMap.get(l.id)
      if (!sync && !sincronizados.has(l.id)) return l
      if (!sync) {
        return sincronizados.has(l.id)
          ? { ...l, sync_pendente: false }
          : l
      }
      return {
        ...l,
        payment_supabase_id: sync.payment_supabase_id,
        client_payment_id: sync.client_payment_id ?? l.client_payment_id ?? l.id,
        sync_pendente: false,
      }
    }),
  }
}

export async function sincronizarPagamentosPendentes(
  officeLocalId: string,
  dados: CraftDatabase,
  idsPendentes?: string[]
): Promise<ResultadoPersistenciaPagamentos & { mensagem: string }> {
  const pendentes =
    idsPendentes && idsPendentes.length > 0
      ? dados.lancamentos.filter((l) => idsPendentes.includes(l.id))
      : dados.lancamentos.filter((l) => precisaSincronizarPagamento(l))

  if (pendentes.length === 0) {
    return {
      ok: true,
      erros: [],
      enviados: 0,
      contagem: { service_order_payments: 0, financial_transactions: 0 },
      sincronizados_ids: [],
      correcoes_os: [],
      duplicatas_evitadas_ids: [],
      sync_atualizados: [],
      orfaos_marcados: [],
      mensagem: 'Nenhum pagamento pendente para sincronizar.',
    }
  }

  const idsAlvo = pendentes.map((p) => p.id)

  console.info(
    '[Craft Supabase] Ordem: 1) verificar/sync OS → 2) pagamentos → 3) financial_transactions'
  )

  const deps = await garantirOsParaPagamentosPendentes(officeLocalId, dados, idsAlvo)
  if (deps.erros.length > 0) {
    console.warn('[Craft Supabase] OS antes dos pagamentos (parcial/erro):', deps.erros)
  }
  if (deps.osSincronizadas > 0) {
    console.info('[Craft Supabase] OS preparadas para pagamentos:', deps.osSincronizadas)
  }

  const resultado = await persistirPagamentosNoSupabase(officeLocalId, dados, {
    lancamentoIds: idsAlvo,
    sincronizarDependencias: false,
  })

  const qtdOk = resultado.sincronizados_ids.length
  const qtdErro = pendentes.length - qtdOk
  const osFoiSincronizada = deps.osSincronizadas > 0

  let mensagem: string
  if (resultado.ok) {
    if (qtdOk === 1 && osFoiSincronizada) {
      mensagem = MENSAGEM_SUCESSO_OS_E_PAGAMENTO
    } else if (qtdOk === 1 && resultado.duplicatas_evitadas_ids.length === 1) {
      mensagem = MENSAGEM_DUPLICIDADE_EVITADA
    } else if (qtdOk === 1) {
      mensagem = MENSAGEM_SUCESSO_PAGAMENTO
    } else {
      mensagem = `${qtdOk} pagamento(s) sincronizado(s) com sucesso.`
    }
  } else if (qtdOk > 0) {
    mensagem = `${qtdOk} sincronizado(s), ${qtdErro} erro(s).`
  } else if (deps.erros.some((e) => e.includes('Supabase'))) {
    mensagem = MENSAGEM_OS_NAO_SINCRONIZADA
  } else {
    mensagem =
      resultado.erros[0]?.mensagem ??
      `Não foi possível sincronizar pagamentos (${qtdErro} erro(s)).`
  }

  return { ...resultado, mensagem, ok: resultado.ok || qtdOk > 0 }
}

export function aplicarCorrecoesOsPagamentosLocal(
  dados: CraftDatabase,
  correcoes: ResultadoPersistenciaPagamentos['correcoes_os']
): CraftDatabase {
  if (correcoes.length === 0) return dados

  const mapa = new Map(correcoes.map((c) => [c.lancamento_id, c.ordem_servico_id_novo]))
  return {
    ...dados,
    lancamentos: dados.lancamentos.map((l) => {
      const novoOsId = mapa.get(l.id)
      if (!novoOsId) return l
      return { ...l, ordem_servico_id: novoOsId }
    }),
  }
}
