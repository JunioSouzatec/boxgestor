import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { localIdParaUuid } from '@/lib/local-id-uuid'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import {
  formatarErroSupabase,
  formatarErroSupabaseParaUsuario,
  isErroRlsSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import { SyncIdMap } from '@/services/supabase-sync/mappers'
import { obterUuidPorLocalId, registrarMapeamentoId } from '@/services/supabase-sync/id-registry'
import { semearSyncIdMapDoRegistry } from '@/services/supabase-sync/service-order-supabase.helpers'
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
import type { PostgrestError } from '@supabase/supabase-js'

export const MENSAGEM_SUCESSO_PAGAMENTO =
  'Pagamento salvo no Supabase com sucesso.'

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
}

export interface ResultadoCarregamentoPagamentos {
  ok: boolean
  lancamentos: LancamentoFinanceiro[]
  erros: SyncErro[]
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
  erros: SyncErro[]
): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  const payload = sanitizarLinhaParaSupabase(linha)
  const { error } = await supabase.from(tabela).upsert(payload as never, { onConflict: 'id' })

  if (!error) return true

  console.error(`[Craft Supabase] Erro ao salvar ${entidade}:`, {
    tabela,
    payload,
    codigo: error.code,
    mensagem: error.message,
    detalhe: error.details,
    hint: error.hint,
  })

  erros.push({
    entidade,
    id: String(linha.id ?? ''),
    mensagem: formatarErroSupabaseParaUsuario(error),
  })

  registrarUltimoErroSupabase({
    mensagem: error.message,
    entidade,
    codigo: error.code,
    erro_tecnico: formatarErroSupabase(error),
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

async function persistirLancamentoOS(
  lancamento: LancamentoFinanceiro,
  os: OrdemServico,
  officeUuid: string,
  ids: SyncIdMap,
  createdBy: string | null | undefined,
  osValidas: Set<string>,
  erros: SyncErro[]
): Promise<boolean> {
  const osUuid = await ids.uuid(os.id)
  if (!osValidas.has(osUuid)) {
    erros.push({
      entidade: 'Pagamento OS',
      id: lancamento.id,
      mensagem:
        'A OS ainda não está no Supabase. Sincronize a ordem de serviço antes do pagamento.',
    })
    console.warn('[Craft Supabase] Pagamento sem OS no Supabase', {
      lancamento_id: lancamento.id,
      os_local: os.id,
      os_uuid: osUuid,
      office_id: officeUuid,
    })
    return false
  }

  const finRow = await mapearFinancialTransaction(lancamento, officeUuid, ids, os)
  const finOk = await upsertLinha('financial_transactions', finRow, 'Lançamento financeiro', erros)
  if (!finOk) return false

  const finUuid = String(finRow.id)
  const payRow = await mapearServiceOrderPayment(
    lancamento,
    officeUuid,
    ids,
    os,
    finUuid,
    createdBy
  )
  return upsertLinha('service_order_payments', payRow, 'Pagamento OS', erros)
}

async function persistirLancamentoGeral(
  lancamento: LancamentoFinanceiro,
  officeUuid: string,
  ids: SyncIdMap,
  ordens: Map<string, OrdemServico>,
  osValidas: Set<string>,
  erros: SyncErro[]
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
        mensagem: 'OS vinculada ainda não está no Supabase.',
      })
      return false
    }
  }

  const finRow = await mapearFinancialTransaction(lancamento, officeUuid, ids, os ?? null)
  return upsertLinha('financial_transactions', finRow, 'Lançamento financeiro', erros)
}

export async function persistirPagamentosNoSupabase(
  officeLocalId: string,
  dados: CraftDatabase,
  opcoes?: { createdBy?: string | null; officeUuid?: string; lancamentoIds?: string[] }
): Promise<ResultadoPersistenciaPagamentos> {
  const erros: SyncErro[] = []
  const contagem = { service_order_payments: 0, financial_transactions: 0 }

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      erros: [{ entidade: 'conexão', mensagem: 'Supabase não configurado' }],
      enviados: 0,
      contagem,
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      erros: [{ entidade: 'conexão', mensagem: 'Cliente Supabase indisponível' }],
      enviados: 0,
      contagem,
    }
  }

  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  const officeUuid = opcoes?.officeUuid ?? contexto?.officeUuid ?? officeLocalId
  const createdBy = opcoes?.createdBy ?? contexto?.userId ?? null

  const ids = new SyncIdMap()
  semearIdsPagamentos(ids, officeLocalId, officeUuid, dados)

  const ordensMap = mapaOsPorId(dados.ordens_servico)
  const osValidas = await carregarIdsOsValidos(supabase, officeUuid)

  const idsFiltro = opcoes?.lancamentoIds ? new Set(opcoes.lancamentoIds) : null
  let enviados = 0

  for (const lancamento of dados.lancamentos) {
    if (lancamento.cancelado) continue
    if (idsFiltro && !idsFiltro.has(lancamento.id)) continue

    try {
      if (ehPagamentoOS(lancamento)) {
        const os = ordensMap.get(lancamento.ordem_servico_id!)
        if (!os) {
          erros.push({
            entidade: 'Pagamento OS',
            id: lancamento.id,
            mensagem: 'OS não encontrada para o pagamento.',
          })
          continue
        }

        const ok = await persistirLancamentoOS(
          lancamento,
          os,
          officeUuid,
          ids,
          createdBy,
          osValidas,
          erros
        )
        if (ok) {
          contagem.service_order_payments++
          contagem.financial_transactions++
          enviados += 2
          registrarMapeamentoId(lancamento.id, String(await ids.uuid(`fin:${lancamento.id}`)))
          registrarMapeamentoId(`pay:${lancamento.id}`, String(await ids.uuid(`pay:${lancamento.id}`)))
        }
      } else {
        const ok = await persistirLancamentoGeral(
          lancamento,
          officeUuid,
          ids,
          ordensMap,
          osValidas,
          erros
        )
        if (ok) {
          contagem.financial_transactions++
          enviados++
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
  }

  return { ok: erros.length === 0, erros, enviados, contagem }
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
    return { ok: true, mensagem: MENSAGEM_SUCESSO_PAGAMENTO }
  }

  return {
    ok: false,
    mensagem: isErroRlsSupabase({ message: resultado.erros[0]?.mensagem ?? '' } as PostgrestError)
      ? resultado.erros[0]?.mensagem
      : resultado.erros[0]?.mensagem ?? MENSAGEM_FALLBACK_PAGAMENTO,
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
        mensagem: formatarErroSupabaseParaUsuario(paymentsRes.error),
      })
    }
    if (financialRes.error) {
      erros.push({
        entidade: 'Financeiro',
        mensagem: formatarErroSupabaseParaUsuario(financialRes.error),
      })
    }

    if (erros.length > 0 && !paymentsRes.data && !financialRes.data) {
      return { ok: false, lancamentos: [], erros }
    }

    const mapaOs = new Map<string, string>()
    for (const os of baseLocal.ordens_servico) {
      const uuid = obterUuidPorLocalId(os.id) ?? (await localIdParaUuid(os.id))
      mapaOs.set(uuid, os.id)
    }

    const candidatos = baseLocal.lancamentos.map((l) => l.id)
    const porId = new Map<string, LancamentoFinanceiro>()

    for (const row of (paymentsRes.data ?? []) as ServiceOrderPaymentRow[]) {
      const item = await mapearServiceOrderPaymentReverso(row, officeLocalId, mapaOs, candidatos)
      if (item) porId.set(item.id, item)
    }

    for (const row of (financialRes.data ?? []) as FinancialTransactionRow[]) {
      const meta = row.craft_meta as { local_id?: string } | undefined
      if (meta?.local_id && porId.has(meta.local_id)) continue

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
  const mapa = new Map<string, LancamentoFinanceiro>()

  for (const l of remoto) {
    mapa.set(l.id, l)
  }

  for (const l of local) {
    if (!mapa.has(l.id)) {
      mapa.set(l.id, l)
    }
  }

  return Array.from(mapa.values()).sort(
    (a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id)
  )
}

export async function sincronizarPagamentosPendentes(
  officeLocalId: string,
  dados: CraftDatabase,
  idsPendentes?: string[]
): Promise<ResultadoPersistenciaPagamentos & { mensagem: string }> {
  const pendentes =
    idsPendentes && idsPendentes.length > 0
      ? dados.lancamentos.filter((l) => idsPendentes.includes(l.id))
      : dados.lancamentos.filter((l) => !l.cancelado && (l.sync_pendente ?? false))

  if (pendentes.length === 0) {
    return {
      ok: true,
      erros: [],
      enviados: 0,
      contagem: { service_order_payments: 0, financial_transactions: 0 },
      mensagem: 'Nenhum pagamento pendente para sincronizar.',
    }
  }

  const resultado = await persistirPagamentosNoSupabase(officeLocalId, dados, {
    lancamentoIds: pendentes.map((p) => p.id),
  })

  const sincronizados = new Set(
    pendentes
      .filter((p) => !resultado.erros.some((e) => e.id === p.id))
      .map((p) => p.id)
  )

  let mensagem: string
  if (resultado.ok) {
    mensagem = `Pagamentos sincronizados: ${resultado.contagem.service_order_payments} pagamento(s) de OS, ${resultado.contagem.financial_transactions} lançamento(s) financeiro(s).`
  } else if (sincronizados.size > 0) {
    mensagem = `Sincronização parcial: ${sincronizados.size} pagamento(s) enviado(s), ${resultado.erros.length} erro(s).`
  } else {
    mensagem = `Não foi possível sincronizar pagamentos: ${resultado.erros[0]?.mensagem ?? 'erro desconhecido'}.`
  }

  return { ...resultado, mensagem, ok: resultado.ok || sincronizados.size > 0 }
}
