import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { localIdParaUuid } from '@/lib/local-id-uuid'
import { oficinaComLogoPreservada } from '@/lib/oficina-logo'
import {
  mapearCustomer,
  mapearMotorcycle,
  mapearOffice,
  mapearServiceOrder,
  mapearSettings,
  SyncIdMap,
  type DadosSyncFase1,
} from '@/services/supabase-sync/mappers'
import { registrarMapeamentos } from '@/services/supabase-sync/id-registry'
import {
  mapearCustomerReverso,
  mapearMotorcycleReverso,
  mapearOfficeReverso,
  mapearServiceOrderReverso,
  type CustomerRow,
  type DadosFase1Remotos,
  type MotorcycleRow,
  type OfficeRow,
  type ServiceOrderRow,
  type SettingsRow,
} from '@/services/supabase-sync/reverse-mappers'
import type { SyncErro } from '@/services/supabase-sync/supabase-sync.types'
import type { CraftDatabase } from '@/types/database'
import type { PostgrestError } from '@supabase/supabase-js'

const TAMANHO_LOTE = 50

export interface ResultadoPersistenciaFase1 {
  ok: boolean
  erros: SyncErro[]
  enviados: number
}

export interface ResultadoCarregamentoFase1 {
  ok: boolean
  dados?: DadosFase1Remotos
  erros: SyncErro[]
  mensagem?: string
}

export function extrairDadosFase1(dados: CraftDatabase): DadosSyncFase1 {
  return {
    configuracao: dados.configuracao,
    clientes: dados.clientes,
    motos: dados.motos,
    ordens_servico: dados.ordens_servico,
    proximo_numero_os: dados.proximo_numero_os,
  }
}

export function formatarErroSupabase(error: PostgrestError): string {
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

async function upsertEmLote(
  tabela: 'offices' | 'settings' | 'customers' | 'motorcycles' | 'service_orders',
  linhas: Record<string, unknown>[],
  entidade: string,
  erros: SyncErro[],
  onConflict: 'id' | 'office_id' = 'id'
): Promise<number> {
  if (linhas.length === 0) return 0

  const supabase = getSupabaseClient()
  if (!supabase) return 0

  const { error } = await supabase
    .from(tabela)
    .upsert(linhas as never[], { onConflict })

  if (!error) return linhas.length

  console.error(`[Craft Supabase] Erro em lote (${tabela}):`, {
    entidade,
    codigo: error.code,
    mensagem: error.message,
    detalhe: error.details,
    hint: error.hint,
  })

  let enviados = 0
  for (const linha of linhas) {
    const { error: errItem } = await supabase
      .from(tabela)
      .upsert(linha as never, { onConflict })
    if (errItem) {
      const detalhe = formatarErroSupabase(errItem)
      console.error(`[Craft Supabase] Erro ao salvar ${entidade}:`, {
        tabela,
        id: linha.id,
        codigo: errItem.code,
        mensagem: errItem.message,
        detalhe: errItem.details,
        hint: errItem.hint,
      })
      erros.push({
        entidade,
        id: String(linha.id ?? ''),
        mensagem: detalhe,
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

export async function persistirFase1NoSupabase(
  officeLocalId: string,
  dados: DadosSyncFase1
): Promise<ResultadoPersistenciaFase1> {
  const erros: SyncErro[] = []
  const officeLocalResolvido =
    dados.configuracao.office_id ??
    dados.configuracao.oficina_id ??
    dados.configuracao.id ??
    officeLocalId

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      erros: [{ entidade: 'conexão', mensagem: 'Supabase não configurado' }],
      enviados: 0,
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      erros: [{ entidade: 'conexão', mensagem: 'Cliente Supabase indisponível' }],
      enviados: 0,
    }
  }

  const ids = new SyncIdMap()
  const officeUuid = await ids.uuid(officeLocalResolvido)
  const mapaIds: Record<string, string> = { [officeLocalResolvido]: officeUuid }

  let enviados = 0

  try {
    const officeRow = await mapearOffice(dados.configuracao, ids)
    enviados += await upsertEmLote('offices', [officeRow], 'Oficina', erros)

    const settingsRow = await mapearSettings(dados.configuracao, dados.proximo_numero_os, ids)
    settingsRow.metadata = {
      ...(settingsRow.metadata as Record<string, unknown>),
      ultima_persistencia_de: 'app',
      sincronizado_em: new Date().toISOString(),
    }

    const { data: settingsExistente } = await supabase
      .from('settings')
      .select('id, created_at')
      .eq('office_id', officeUuid)
      .maybeSingle()

    const settingsRemoto = settingsExistente as { id: string; created_at?: string } | null
    if (settingsRemoto?.id) {
      settingsRow.id = settingsRemoto.id
      if (settingsRemoto.created_at) {
        settingsRow.created_at = settingsRemoto.created_at
      }
    }

    enviados += await upsertEmLote('settings', [settingsRow], 'Configurações', erros, 'office_id')

    const customerRows = await Promise.all(
      dados.clientes.map(async (c) => {
        const row = await mapearCustomer(c, officeUuid, ids)
        mapaIds[c.id] = String(row.id)
        return row
      })
    )
    enviados += await upsertEmLotes('customers', customerRows, 'Cliente', erros)

    const motorcycleRows = await Promise.all(
      dados.motos.map(async (m) => {
        const row = await mapearMotorcycle(m, officeUuid, ids)
        mapaIds[m.id] = String(row.id)
        return row
      })
    )
    enviados += await upsertEmLotes('motorcycles', motorcycleRows, 'Moto', erros)

    const orderRows = await Promise.all(
      dados.ordens_servico.map(async (os) => {
        const row = await mapearServiceOrder(os, officeUuid, ids)
        mapaIds[os.id] = String(row.id)
        return row
      })
    )
    enviados += await upsertEmLotes('service_orders', orderRows, 'Ordem de Serviço', erros)

    if (erros.length === 0) {
      registrarMapeamentos(
        Object.fromEntries(Object.entries(mapaIds).map(([local, uuid]) => [uuid, local]))
      )
    }
  } catch (e) {
    erros.push({
      entidade: 'persistência',
      mensagem: e instanceof Error ? e.message : 'Erro inesperado ao salvar no Supabase',
    })
  }

  return { ok: erros.length === 0, erros, enviados }
}

export async function carregarFase1DoSupabase(
  officeLocalId: string,
  baseLocal: CraftDatabase
): Promise<ResultadoCarregamentoFase1> {
  const erros: SyncErro[] = []

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      erros: [{ entidade: 'conexão', mensagem: 'Supabase não configurado' }],
      mensagem: 'Supabase não configurado',
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      erros: [{ entidade: 'conexão', mensagem: 'Cliente Supabase indisponível' }],
      mensagem: 'Cliente Supabase indisponível',
    }
  }

  try {
    const officeUuid = await localIdParaUuid(officeLocalId)

    const [officeRes, settingsRes, customersRes, motorcyclesRes, ordersRes] = await Promise.all([
      supabase.from('offices').select('*').eq('id', officeUuid).maybeSingle(),
      supabase.from('settings').select('*').eq('office_id', officeUuid).maybeSingle(),
      supabase.from('customers').select('*').eq('office_id', officeUuid),
      supabase.from('motorcycles').select('*').eq('office_id', officeUuid),
      supabase.from('service_orders').select('*').eq('office_id', officeUuid),
    ])

    for (const res of [officeRes, settingsRes, customersRes, motorcyclesRes, ordersRes]) {
      if (res.error) {
        erros.push({
          entidade: 'carregamento',
          mensagem: formatarErroSupabase(res.error),
        })
      }
    }

    if (erros.length > 0) {
      return { ok: false, erros, mensagem: erros[0]?.mensagem }
    }

    if (!officeRes.data) {
      return {
        ok: false,
        erros: [{ entidade: 'Oficina', mensagem: 'Nenhum registro de oficina no Supabase' }],
        mensagem: 'Oficina não encontrada no Supabase. Execute a sincronização manual primeiro.',
      }
    }

    const officeRow = officeRes.data as OfficeRow
    const settingsRow = (settingsRes.data as SettingsRow | null) ?? null

    const candidatosCliente = baseLocal.clientes.map((c) => c.id)
    const candidatosMoto = baseLocal.motos.map((m) => m.id)
    const candidatosOs = baseLocal.ordens_servico.map((o) => o.id)

    const configuracao = await mapearOfficeReverso(officeRow, settingsRow, officeLocalId)

    const clientes = await Promise.all(
      ((customersRes.data ?? []) as CustomerRow[]).map((row) =>
        mapearCustomerReverso(row, officeLocalId, candidatosCliente)
      )
    )

    const mapaCliente = new Map<string, string>()
    for (const row of (customersRes.data ?? []) as CustomerRow[]) {
      const local = clientes.find(
        (c) => c.nome === row.name && c.telefone === row.phone
      )
      if (local) mapaCliente.set(row.id, local.id)
    }
    for (const c of clientes) {
      const uuid = await localIdParaUuid(c.id)
      mapaCliente.set(uuid, c.id)
    }

    const motos = await Promise.all(
      ((motorcyclesRes.data ?? []) as MotorcycleRow[]).map((row) =>
        mapearMotorcycleReverso(row, officeLocalId, candidatosMoto, mapaCliente)
      )
    )

    const mapaMoto = new Map<string, string>()
    for (const row of (motorcyclesRes.data ?? []) as MotorcycleRow[]) {
      const local = motos.find((m) => m.placa === row.plate)
      if (local) mapaMoto.set(row.id, local.id)
    }

    const ordens_servico = await Promise.all(
      ((ordersRes.data ?? []) as ServiceOrderRow[]).map((row) =>
        mapearServiceOrderReverso(
          row,
          officeLocalId,
          candidatosOs,
          mapaCliente,
          mapaMoto
        )
      )
    )

    const proximo_numero_os =
      settingsRow?.next_service_order_num ?? baseLocal.proximo_numero_os

    const mapaRegistro: Record<string, string> = {}
    mapaRegistro[officeLocalId] = officeUuid
    for (const c of clientes) mapaRegistro[c.id] = await localIdParaUuid(c.id)
    for (const m of motos) mapaRegistro[m.id] = await localIdParaUuid(m.id)
    for (const os of ordens_servico) mapaRegistro[os.id] = await localIdParaUuid(os.id)
    registrarMapeamentos(
      Object.fromEntries(
        Object.entries(mapaRegistro).map(([local, uuid]) => [uuid, local])
      )
    )

    return {
      ok: true,
      dados: { configuracao, clientes, motos, ordens_servico, proximo_numero_os },
      erros: [],
    }
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'Erro ao carregar do Supabase'
    return {
      ok: false,
      erros: [{ entidade: 'carregamento', mensagem }],
      mensagem,
    }
  }
}

export function mesclarFase1Remota(baseLocal: CraftDatabase, remoto: DadosFase1Remotos): CraftDatabase {
  return {
    ...baseLocal,
    configuracao: oficinaComLogoPreservada(remoto.configuracao, baseLocal.configuracao),
    clientes: remoto.clientes,
    motos: remoto.motos,
    ordens_servico: remoto.ordens_servico,
    proximo_numero_os: remoto.proximo_numero_os,
  }
}
