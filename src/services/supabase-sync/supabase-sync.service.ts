import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { localCraftRepository } from '@/services/repository/local.repository'
import {
  mapearCustomer,
  mapearMotorcycle,
  mapearOffice,
  mapearServiceOrder,
  mapearSettings,
  SyncIdMap,
  type DadosSyncFase1,
} from '@/services/supabase-sync/mappers'
import { salvarEstadoSincronizacao } from '@/services/supabase-sync/sync-state.storage'
import type {
  ContagemSyncEnviados,
  ResultadoSincronizacaoSupabase,
  SyncErro,
} from '@/services/supabase-sync/supabase-sync.types'
import { OFFICE_ID } from '@/types/base'
import type { PostgrestError } from '@supabase/supabase-js'

const TAMANHO_LOTE = 50

function contagemVazia(): ContagemSyncEnviados {
  return {
    office: 0,
    settings: 0,
    customers: 0,
    motorcycles: 0,
    service_orders: 0,
    total: 0,
  }
}

function somarTotal(enviados: ContagemSyncEnviados): number {
  return (
    enviados.office +
    enviados.settings +
    enviados.customers +
    enviados.motorcycles +
    enviados.service_orders
  )
}

function formatarErroSupabase(error: PostgrestError): string {
  const msg = error.message ?? 'Erro desconhecido'
  if (
    error.code === '42501' ||
    msg.toLowerCase().includes('permission denied') ||
    msg.toLowerCase().includes('row-level security') ||
    msg.toLowerCase().includes('rls')
  ) {
    return `${msg} — Execute docs/supabase-sync-policies.sql no SQL Editor do Supabase.`
  }
  return msg
}

function lerDadosLocalStorage(officeId: string = OFFICE_ID): DadosSyncFase1 {
  const db = localCraftRepository.carregar(officeId)
  return {
    configuracao: db.configuracao,
    clientes: db.clientes,
    motos: db.motos,
    ordens_servico: db.ordens_servico,
    proximo_numero_os: db.proximo_numero_os,
  }
}

async function upsertEmLote(
  tabela: 'offices' | 'settings' | 'customers' | 'motorcycles' | 'service_orders',
  linhas: Record<string, unknown>[],
  entidade: string,
  erros: SyncErro[]
): Promise<number> {
  if (linhas.length === 0) return 0

  const supabase = getSupabaseClient()
  if (!supabase) return 0

  const { error } = await supabase.from(tabela).upsert(linhas as never[], { onConflict: 'id' })

  if (!error) return linhas.length

  let enviados = 0
  for (const linha of linhas) {
    const { error: errItem } = await supabase.from(tabela).upsert(linha as never, { onConflict: 'id' })
    if (errItem) {
      erros.push({
        entidade,
        id: String(linha.id ?? ''),
        mensagem: formatarErroSupabase(errItem),
      })
    } else {
      enviados++
    }
  }
  return enviados
}

async function upsertEmLotes(
  tabela: 'customers' | 'motorcycles' | 'service_orders',
  linhas: Record<string, unknown>[],
  entidade: string,
  erros: SyncErro[]
): Promise<number> {
  let total = 0
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE)
    total += await upsertEmLote(tabela, lote, entidade, erros)
  }
  return total
}

export async function sincronizarDadosLocaisComSupabase(
  officeId: string = OFFICE_ID
): Promise<ResultadoSincronizacaoSupabase> {
  const inicioEm = new Date().toISOString()
  const enviados = contagemVazia()
  const erros: SyncErro[] = []

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      mensagem: 'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
      inicioEm,
      fimEm: new Date().toISOString(),
      enviados,
      erros: [{ entidade: 'conexão', mensagem: 'Variáveis de ambiente ausentes' }],
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      mensagem: 'Não foi possível inicializar o cliente Supabase.',
      inicioEm,
      fimEm: new Date().toISOString(),
      enviados,
      erros: [{ entidade: 'conexão', mensagem: 'Cliente Supabase indisponível' }],
    }
  }

  const dados = lerDadosLocalStorage(officeId)
  const ids = new SyncIdMap()
  const officeLocalId =
    dados.configuracao.office_id ?? dados.configuracao.oficina_id ?? dados.configuracao.id
  const officeUuid = await ids.uuid(officeLocalId)

  try {
    const officeRow = await mapearOffice(dados.configuracao, ids)
    enviados.office = await upsertEmLote('offices', [officeRow], 'Oficina', erros)

    const settingsRow = await mapearSettings(dados.configuracao, dados.proximo_numero_os, ids)
    settingsRow.metadata = {
      ...(settingsRow.metadata as Record<string, unknown>),
      ultima_sincronizacao_de: 'local',
      sincronizado_em: new Date().toISOString(),
    }
    enviados.settings = await upsertEmLote('settings', [settingsRow], 'Configurações', erros)

    const customerRows = await Promise.all(
      dados.clientes.map((c) => mapearCustomer(c, officeUuid, ids))
    )
    enviados.customers = await upsertEmLotes('customers', customerRows, 'Cliente', erros)

    const motorcycleRows = await Promise.all(
      dados.motos.map((m) => mapearMotorcycle(m, officeUuid, ids))
    )
    enviados.motorcycles = await upsertEmLotes('motorcycles', motorcycleRows, 'Moto', erros)

    const orderRows = await Promise.all(
      dados.ordens_servico.map((os) => mapearServiceOrder(os, officeUuid, ids))
    )
    enviados.service_orders = await upsertEmLotes(
      'service_orders',
      orderRows,
      'Ordem de Serviço',
      erros
    )
  } catch (e) {
    erros.push({
      entidade: 'sincronização',
      mensagem: e instanceof Error ? e.message : 'Erro inesperado durante a sincronização',
    })
  }

  enviados.total = somarTotal(enviados)
  const fimEm = new Date().toISOString()
  const ok = erros.length === 0 && enviados.total > 0

  const resultado: ResultadoSincronizacaoSupabase = {
    ok,
    mensagem:
      erros.length === 0
        ? enviados.total > 0
          ? `Sincronização concluída: ${enviados.total} registro(s) enviado(s).`
          : 'Nenhum dado local encontrado para sincronizar.'
        : `Sincronização parcial: ${enviados.total} enviado(s), ${erros.length} erro(s).`,
    inicioEm,
    fimEm,
    enviados,
    erros,
  }

  salvarEstadoSincronizacao({
    ultimaSincronizacao: fimEm,
    ultimoResultado: resultado,
  })

  return resultado
}
