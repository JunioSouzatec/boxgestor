import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import {
  aplicarOfficeUuidEmDadosFase1,
  obterContextoOfficeSupabase,
} from '@/lib/supabase-office-context'
import { isUuidFormato, localIdParaUuid, resolverOfficeUuid } from '@/lib/local-id-uuid'
import { mesclarConfiguracaoOficina } from '@/lib/oficina-merge'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import {
  aplicarDedupClientesNoDatabase,
  chaveUnicidadeCliente,
  normalizarCpfCliente,
  normalizarNomeCliente,
  normalizarTelefoneCliente,
} from '@/services/clientes/deduplicate-clientes.service'
import {
  logCarregamentoSupabaseDev,
  logPersistenciaClienteDev,
} from '@/services/supabase-sync/supabase-load-debug'
import {
  mapearCustomer,
  mapearMotorcycle,
  mapearOffice,
  mapearServiceOrder,
  mapearSettings,
  SyncIdMap,
  type DadosSyncFase1,
} from '@/services/supabase-sync/mappers'
import {
  obterUuidPorLocalId,
  registrarMapeamentos,
} from '@/services/supabase-sync/id-registry'
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
import type { Cliente } from '@/types/cliente'
import type { CraftDatabase } from '@/types/database'
import {
  filtrarOrdensServicoComDependenciasValidas,
  semearSyncIdMapDoRegistry,
  type PayloadDiagnosticoOS,
} from '@/services/supabase-sync/service-order-supabase.helpers'
import type { PostgrestError } from '@supabase/supabase-js'

const MENSAGEM_RLS_USUARIO =
  'Não foi possível salvar no Supabase por política de segurança. Rode o SQL de correção RLS (docs/supabase-fix-service-orders-rls.sql) e tente novamente.'

export function isErroRlsSupabase(error: PostgrestError | { message?: string; code?: string }): boolean {
  const msg = (error.message ?? '').toLowerCase()
  return (
    error.code === '42501' ||
    msg.includes('permission denied') ||
    msg.includes('row-level security') ||
    msg.includes('rls') ||
    msg.includes('violates row-level security')
  )
}

export function formatarErroSupabase(error: PostgrestError): string {
  const msg = error.message ?? 'Erro desconhecido'
  if (isErroRlsSupabase(error)) {
    return `${msg} — ${MENSAGEM_RLS_USUARIO}`
  }
  return msg
}

export function formatarErroSupabaseParaUsuario(error: PostgrestError): string {
  if (isErroRlsSupabase(error)) {
    return MENSAGEM_RLS_USUARIO
  }
  return error.message ?? 'Erro ao salvar no Supabase.'
}

export function mensagemFallbackPersistencia(erros: { mensagem: string }[]): string {
  const temRls = erros.some((e) => e.mensagem.includes('política de segurança'))
  if (temRls) return MENSAGEM_RLS_USUARIO
  return 'Não foi possível salvar no Supabase. O registro foi salvo localmente e será sincronizado depois.'
}

function sanitizarLinhaParaSupabase(linha: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(linha)) {
    if (valor !== undefined) out[chave] = valor
  }
  return out
}

export interface ResultadoPersistenciaFase1 {
  ok: boolean
  erros: SyncErro[]
  enviados: number
  contagem: {
    office: number
    settings: number
    customers: number
    motorcycles: number
    service_orders: number
  }
  avisos: string[]
}

export interface OpcoesPersistenciaFase1 {
  /** UUID real da oficina no Supabase (profile.office_id) */
  officeUuidDestino?: string
  /** Não inserir nova office — apenas update ou pular (migração com Auth) */
  usarOficinaExistente?: boolean
  /** Não atualizar offices/settings — sync automático de clientes/OS (padrão com Auth) */
  pularOficina?: boolean
}

export interface ResultadoCarregamentoFase1 {
  ok: boolean
  dados?: DadosFase1Remotos
  erros: SyncErro[]
  mensagem?: string
}

const TAMANHO_LOTE = 50

export function extrairDadosFase1(dados: CraftDatabase): DadosSyncFase1 {
  return {
    configuracao: dados.configuracao,
    clientes: dados.clientes,
    motos: dados.motos,
    ordens_servico: dados.ordens_servico,
    proximo_numero_os: dados.proximo_numero_os,
  }
}

/** Dados mínimos para sincronizar uma OS e suas dependências diretas */
export function extrairDadosFase1ParaOs(
  dados: CraftDatabase,
  osId: string
): DadosSyncFase1 | null {
  const os = dados.ordens_servico.find((o) => o.id === osId)
  if (!os) return null

  const cliente = dados.clientes.find((c) => c.id === os.cliente_id)
  const moto = dados.motos.find((m) => m.id === os.moto_id)

  return {
    configuracao: dados.configuracao,
    clientes: cliente ? [cliente] : [],
    motos: moto ? [moto] : [],
    ordens_servico: [os],
    proximo_numero_os: dados.proximo_numero_os,
  }
}

function deduplicarDadosFase1(dados: DadosSyncFase1): { dados: DadosSyncFase1; removidos: number } {
  const baseMinima: CraftDatabase = {
    configuracao: dados.configuracao,
    clientes: dados.clientes,
    motos: dados.motos,
    ordens_servico: dados.ordens_servico,
    proximo_numero_os: dados.proximo_numero_os,
    pecas: [],
    lancamentos: [],
    agendamentos: [],
    modelos_checklist: [],
    servicos_catalogo: [],
    fornecedores: [],
    movimentacoes_estoque: [],
  }
  const { db, removidos } = aplicarDedupClientesNoDatabase(baseMinima)
  return {
    dados: {
      configuracao: db.configuracao,
      clientes: db.clientes,
      motos: db.motos,
      ordens_servico: db.ordens_servico,
      proximo_numero_os: db.proximo_numero_os,
    },
    removidos,
  }
}

function construirIndiceClientesExistentes(
  rows: { id: string; name: string; phone: string; cpf: string | null }[]
): Map<string, string> {
  const indice = new Map<string, string>()
  for (const row of rows) {
    const cpf = normalizarCpfCliente(row.cpf)
    if (cpf.length >= 11) indice.set(`cpf:${cpf}`, row.id)

    const tel = normalizarTelefoneCliente(row.phone)
    const nome = normalizarNomeCliente(row.name)
    if (tel.length >= 8) {
      indice.set(`tel:${tel}|nome:${nome}`, row.id)
      indice.set(`tel:${tel}`, row.id)
    }
  }
  return indice
}

function buscarUuidClienteExistente(
  cliente: Cliente,
  indice: Map<string, string>
): string | undefined {
  const chave = chaveUnicidadeCliente(cliente)
  const direto = indice.get(chave)
  if (direto) return direto

  const cpf = normalizarCpfCliente(cliente.cpf)
  if (cpf.length >= 11) return indice.get(`cpf:${cpf}`)

  const tel = normalizarTelefoneCliente(cliente.telefone)
  const nome = normalizarNomeCliente(cliente.nome)
  if (tel.length >= 8) {
    return indice.get(`tel:${tel}|nome:${nome}`) ?? indice.get(`tel:${tel}`)
  }

  return undefined
}

function normalizarPlacaMoto(placa: string): string {
  return placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function construirIndiceMotosExistentes(
  rows: { id: string; plate: string }[]
): Map<string, string> {
  const indice = new Map<string, string>()
  for (const row of rows) {
    const placa = normalizarPlacaMoto(row.plate)
    if (placa) indice.set(placa, row.id)
  }
  return indice
}

function buscarUuidMotoExistente(
  placa: string,
  indice: Map<string, string>
): string | undefined {
  const norm = normalizarPlacaMoto(placa)
  if (!norm) return undefined
  return indice.get(norm)
}

interface ContextoErroServiceOrder {
  officeUuid?: string
  payloadsDiag?: PayloadDiagnosticoOS[]
}

async function upsertEmLote(
  tabela: 'offices' | 'settings' | 'customers' | 'motorcycles' | 'service_orders',
  linhas: Record<string, unknown>[],
  entidade: string,
  erros: SyncErro[],
  onConflict: 'id' | 'office_id' = 'id',
  contextoOs?: ContextoErroServiceOrder
): Promise<number> {
  if (linhas.length === 0) return 0

  const linhasSanitizadas = linhas.map(sanitizarLinhaParaSupabase)

  const supabase = getSupabaseClient()
  if (!supabase) return 0

  if (import.meta.env.DEV && linhasSanitizadas[0]) {
    console.debug(`[Craft Supabase] upsert ${tabela}`, {
      amostra: linhasSanitizadas[0],
      total: linhasSanitizadas.length,
    })
  }

  const { error } = await supabase
    .from(tabela)
    .upsert(linhasSanitizadas as never[], { onConflict })

  if (!error) return linhas.length

  console.error(`[Craft Supabase] Erro em lote (${tabela}):`, {
    entidade,
    codigo: error.code,
    mensagem: error.message,
    detalhe: error.details,
    hint: error.hint,
  })

  let enviados = 0
  for (const linha of linhasSanitizadas) {
    const { error: errItem } = await supabase
      .from(tabela)
      .upsert(linha as never, { onConflict })
    if (errItem) {
      console.error(`[Craft Supabase] Erro ao salvar ${entidade}:`, {
        tabela,
        payload: linha,
        codigo: errItem.code,
        mensagem: errItem.message,
        detalhe: errItem.details,
        hint: errItem.hint,
        tecnico: formatarErroSupabase(errItem),
      })
      erros.push({
        entidade,
        id: String(linha.id ?? ''),
        mensagem: formatarErroSupabaseParaUsuario(errItem),
      })
      const localIdOs =
        (linha.parts_used as { craft_meta?: { local_id?: string } })?.craft_meta?.local_id ??
        String(linha.id ?? '')
      const diagOs = contextoOs?.payloadsDiag?.find((p) => p.os_local_id === localIdOs)
      registrarUltimoErroSupabase({
        mensagem: errItem.message,
        entidade,
        codigo: errItem.code,
        erro_tecnico: formatarErroSupabase(errItem),
        service_order: diagOs
          ? {
              office_id: String(linha.office_id ?? contextoOs?.officeUuid ?? ''),
              customer_id: String(linha.customer_id ?? ''),
              motorcycle_id: String(linha.motorcycle_id ?? ''),
              os_local_id: diagOs.os_local_id,
              os_numero: diagOs.os_numero,
            }
          : tabela === 'service_orders'
            ? {
                office_id: String(linha.office_id ?? contextoOs?.officeUuid ?? ''),
                customer_id: String(linha.customer_id ?? ''),
                motorcycle_id: String(linha.motorcycle_id ?? ''),
              }
            : undefined,
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
  erros: SyncErro[],
  contextoOs?: ContextoErroServiceOrder
): Promise<number> {
  let total = 0
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE)
    total += await upsertEmLote(tabela, lote, entidade, erros, 'id', contextoOs)
  }
  return total
}

async function atualizarOfficeExistente(
  officeUuid: string,
  officeRow: Record<string, unknown>,
  erros: SyncErro[],
  avisos: string[]
): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  const { id: _id, created_at: _created, ...campos } = officeRow

  const { error } = await supabase
    .from('offices')
    .update({
      ...campos,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', officeUuid)

  if (error) {
    console.error('[Craft Migração] Erro ao atualizar office:', {
      officeUuid,
      codigo: error.code,
      mensagem: error.message,
      detalhe: error.details,
      hint: error.hint,
    })
    erros.push({
      entidade: 'Oficina',
      id: officeUuid,
      mensagem: formatarErroSupabase(error),
    })
    avisos.push(
      'Não foi possível atualizar os dados da oficina, mas a migração dos dados continuará.'
    )
    return false
  }

  return true
}

export async function persistirFase1NoSupabase(
  officeLocalId: string,
  dados: DadosSyncFase1,
  opcoesIn?: OpcoesPersistenciaFase1
): Promise<ResultadoPersistenciaFase1> {
  const contextoAuth = await obterContextoOfficeSupabase(officeLocalId)
  const opcoes: OpcoesPersistenciaFase1 = {
    officeUuidDestino:
      opcoesIn?.officeUuidDestino ?? contextoAuth?.opcoes.officeUuidDestino,
    usarOficinaExistente:
      opcoesIn?.usarOficinaExistente ??
      contextoAuth?.opcoes.usarOficinaExistente ??
      Boolean(contextoAuth?.officeUuid),
  }

  const pularOficina =
    opcoesIn?.pularOficina ?? (opcoes.usarOficinaExistente ? true : false)

  let dadosPersistencia = dados
  if (opcoes.officeUuidDestino) {
    dadosPersistencia = aplicarOfficeUuidEmDadosFase1(dados, opcoes.officeUuidDestino)
  }

  const dedupLocal = deduplicarDadosFase1(dadosPersistencia)
  dadosPersistencia = dedupLocal.dados
  if (dedupLocal.removidos > 0 && import.meta.env.DEV) {
    console.info('[Craft Supabase] Deduplicação local antes de persistir', {
      removidos: dedupLocal.removidos,
      clientes: dadosPersistencia.clientes.length,
    })
  }

  const erros: SyncErro[] = []
  const avisos: string[] = []
  const contagem = {
    office: 0,
    settings: 0,
    customers: 0,
    motorcycles: 0,
    service_orders: 0,
  }

  const officeLocalResolvido =
    dadosPersistencia.configuracao.office_id ??
    dadosPersistencia.configuracao.oficina_id ??
    dadosPersistencia.configuracao.id ??
    officeLocalId

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      erros: [{ entidade: 'conexão', mensagem: 'Supabase não configurado' }],
      enviados: 0,
      contagem,
      avisos,
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      erros: [{ entidade: 'conexão', mensagem: 'Cliente Supabase indisponível' }],
      enviados: 0,
      contagem,
      avisos,
    }
  }

  const ids = new SyncIdMap()
  const officeUuid =
    opcoes.officeUuidDestino?.trim() ||
    (await resolverOfficeUuid(officeLocalResolvido, ids))

  if (import.meta.env.DEV) {
    console.info('[Craft Supabase] persistirFase1', {
      officeLocalId,
      officeLocalResolvido,
      officeUuid,
      usarOficinaExistente: opcoes.usarOficinaExistente,
      clientes: dadosPersistencia.clientes.length,
      motos: dadosPersistencia.motos.length,
      os: dadosPersistencia.ordens_servico.length,
    })
  }

  ids.seed(officeLocalResolvido, officeUuid)
  if (officeLocalId !== officeLocalResolvido) {
    ids.seed(officeLocalId, officeUuid)
  }

  const idsLocais = [
    ...dadosPersistencia.clientes.map((c) => c.id),
    ...dadosPersistencia.motos.map((m) => m.id),
    ...dadosPersistencia.ordens_servico.map((os) => os.id),
    ...dadosPersistencia.ordens_servico.map((os) => os.cliente_id),
    ...dadosPersistencia.ordens_servico.map((os) => os.moto_id),
  ]
  semearSyncIdMapDoRegistry(ids, idsLocais)

  const mapaIds: Record<string, string> = {
    [officeLocalResolvido]: officeUuid,
    [officeLocalId]: officeUuid,
  }

  let enviados = 0

  try {
    if (!pularOficina) {
      const officeRow = await mapearOffice(dadosPersistencia.configuracao, ids)
      officeRow.id = officeUuid

      if (opcoes.usarOficinaExistente) {
        const atualizado = await atualizarOfficeExistente(officeUuid, officeRow, erros, avisos)
        if (atualizado) {
          contagem.office = 1
          enviados++
        }
      } else {
        const n = await upsertEmLote('offices', [officeRow], 'Oficina', erros)
        contagem.office = n
        enviados += n
      }

      const settingsRow = await mapearSettings(
        dadosPersistencia.configuracao,
        dadosPersistencia.proximo_numero_os,
        ids
      )
      settingsRow.office_id = officeUuid
      settingsRow.metadata = {
        ...(settingsRow.metadata as Record<string, unknown>),
        ultima_persistencia_de: opcoes.usarOficinaExistente ? 'migracao_ou_auth' : 'app',
        sincronizado_em: new Date().toISOString(),
        office_uuid_destino: officeUuid,
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

      const settingsEnviados = await upsertEmLote(
        'settings',
        [settingsRow],
        'Configurações',
        erros,
        'office_id'
      )
      contagem.settings = settingsEnviados
      enviados += settingsEnviados
    }

    const { data: clientesExistentes } = await supabase
      .from('customers')
      .select('id, name, phone, cpf')
      .eq('office_id', officeUuid)

    const indiceExistentes = construirIndiceClientesExistentes(
      (clientesExistentes ?? []) as { id: string; name: string; phone: string; cpf: string | null }[]
    )

    const customerRows = await Promise.all(
      dadosPersistencia.clientes.map(async (c) => {
        const uuidExistente = buscarUuidClienteExistente(c, indiceExistentes)
        if (uuidExistente) {
          ids.seed(c.id, uuidExistente)
          logPersistenciaClienteDev({
            acao: 'dedup_skip',
            localId: c.id,
            officeId: officeUuid,
            telefone: c.telefone,
            motivo: 'Cliente já existe no Supabase — reutilizando id',
          })
        } else {
          logPersistenciaClienteDev({
            acao: 'insert',
            localId: c.id,
            officeId: officeUuid,
            telefone: c.telefone,
          })
        }
        const row = await mapearCustomer(c, officeUuid, ids)
        if (uuidExistente) row.id = uuidExistente
        mapaIds[c.id] = String(row.id)
        return row
      })
    )
    contagem.customers = await upsertEmLotes('customers', customerRows, 'Cliente', erros)
    enviados += contagem.customers

    const { data: motosExistentes } = await supabase
      .from('motorcycles')
      .select('id, plate')
      .eq('office_id', officeUuid)

    const indiceMotos = construirIndiceMotosExistentes(
      (motosExistentes ?? []) as { id: string; plate: string }[]
    )

    const motorcycleRows = await Promise.all(
      dadosPersistencia.motos.map(async (m) => {
        const uuidExistente = buscarUuidMotoExistente(m.placa, indiceMotos)
        if (uuidExistente) {
          ids.seed(m.id, uuidExistente)
          if (import.meta.env.DEV) {
            console.info('[Craft Supabase] Moto reutilizada por placa', {
              local_id: m.id,
              placa: m.placa,
              motorcycle_id: uuidExistente,
            })
          }
        }
        const row = await mapearMotorcycle(m, officeUuid, ids)
        if (uuidExistente) row.id = uuidExistente
        mapaIds[m.id] = String(row.id)
        return row
      })
    )
    contagem.motorcycles = await upsertEmLotes('motorcycles', motorcycleRows, 'Moto', erros)
    enviados += contagem.motorcycles

    const clienteIdsLocais = new Set(dadosPersistencia.clientes.map((c) => c.id))
    const motoIdsLocais = new Set(dadosPersistencia.motos.map((m) => m.id))

    const prepOs = await filtrarOrdensServicoComDependenciasValidas(
      supabase,
      officeUuid,
      dadosPersistencia.ordens_servico,
      ids,
      clienteIdsLocais,
      motoIdsLocais
    )
    erros.push(...prepOs.erros.filter((e) => !e.id || !erros.some((x) => x.id === e.id)))
    avisos.push(...prepOs.avisos)

    const orderRows = await Promise.all(
      prepOs.prontas.map(async (os) => {
        const row = await mapearServiceOrder(os, officeUuid, ids)
        mapaIds[os.id] = String(row.id)
        return row
      })
    )
    contagem.service_orders = await upsertEmLotes(
      'service_orders',
      orderRows,
      'Ordem de Serviço',
      erros,
      { officeUuid, payloadsDiag: prepOs.payloadsDiag }
    )
    enviados += contagem.service_orders

    const dadosMigrados =
      contagem.customers + contagem.motorcycles + contagem.service_orders + contagem.settings

    if (erros.length === 0 || dadosMigrados > 0) {
      registrarMapeamentos(
        Object.fromEntries(Object.entries(mapaIds).map(([local, uuid]) => [uuid, local]))
      )
    }
  } catch (e) {
    console.error('[Craft Supabase] Erro inesperado na persistência fase 1:', e)
    erros.push({
      entidade: 'persistência',
      mensagem: e instanceof Error ? e.message : 'Erro inesperado ao salvar no Supabase',
    })
  }

  const dadosMigrados =
    contagem.customers + contagem.motorcycles + contagem.service_orders + contagem.settings

  const ok =
    erros.length === 0 ||
    Boolean(
      opcoes.usarOficinaExistente &&
        dadosMigrados > 0 &&
        erros.every((e) => e.entidade === 'Oficina')
    )

  return { ok, erros, enviados, contagem, avisos }
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
    const officeUuid = isUuidFormato(officeLocalId)
      ? officeLocalId.trim()
      : await localIdParaUuid(officeLocalId)

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
    const clientesReferencia = baseLocal.clientes

    const configuracao = await mapearOfficeReverso(officeRow, settingsRow, officeLocalId)

    const clientesBrutos = await Promise.all(
      ((customersRes.data ?? []) as CustomerRow[]).map((row) =>
        mapearCustomerReverso(row, officeLocalId, candidatosCliente, clientesReferencia)
      )
    )

    const mapaCliente = new Map<string, string>()
    for (const row of (customersRes.data ?? []) as CustomerRow[]) {
      const telRow = normalizarTelefoneCliente(row.phone)
      const nomeRow = normalizarNomeCliente(row.name)
      const local = clientesBrutos.find(
        (c) =>
          normalizarTelefoneCliente(c.telefone) === telRow &&
          normalizarNomeCliente(c.nome) === nomeRow
      )
      if (local) mapaCliente.set(row.id, local.id)
    }
    for (const c of clientesBrutos) {
      const uuid = await localIdParaUuid(c.id)
      mapaCliente.set(uuid, c.id)
    }

    const fase1Bruta: DadosFase1Remotos = {
      configuracao,
      clientes: clientesBrutos,
      motos: [],
      ordens_servico: [],
      proximo_numero_os: settingsRow?.next_service_order_num ?? baseLocal.proximo_numero_os,
    }

    const motos = await Promise.all(
      ((motorcyclesRes.data ?? []) as MotorcycleRow[]).map((row) =>
        mapearMotorcycleReverso(row, officeLocalId, candidatosMoto, mapaCliente)
      )
    )
    fase1Bruta.motos = motos

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
    fase1Bruta.ordens_servico = ordens_servico

    const { dados: fase1Dedup, removidos } = deduplicarDadosFase1(fase1Bruta)
    const clientes = fase1Dedup.clientes
    const motosFinal = fase1Dedup.motos
    const ordensFinal = fase1Dedup.ordens_servico
    const proximo_numero_os = fase1Dedup.proximo_numero_os

    if (import.meta.env.DEV && removidos > 0) {
      console.info('[Craft Supabase] Deduplicação após carregar do Supabase', {
        removidos,
        clientes: clientes.length,
      })
    }

    const mapaRegistro: Record<string, string> = {}
    mapaRegistro[officeLocalId] = officeUuid
    for (const c of clientes) mapaRegistro[c.id] = await localIdParaUuid(c.id)
    for (const m of motosFinal) mapaRegistro[m.id] = await localIdParaUuid(m.id)
    for (const os of ordensFinal) mapaRegistro[os.id] = await localIdParaUuid(os.id)
    registrarMapeamentos(
      Object.fromEntries(
        Object.entries(mapaRegistro).map(([local, uuid]) => [uuid, local])
      )
    )

    logCarregamentoSupabaseDev({
      origem: 'supabase',
      clientesSupabase: clientesBrutos.length,
      clientesLocaisAntes: baseLocal.clientes.length,
      clientesAposDedup: clientes.length,
      duplicadosRemovidos: removidos,
      motos: motosFinal.length,
      os: ordensFinal.length,
      filaPendentes: 0,
    })

    return {
      ok: true,
      dados: {
        configuracao,
        clientes,
        motos: motosFinal,
        ordens_servico: ordensFinal,
        proximo_numero_os,
      },
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
    configuracao: mesclarConfiguracaoOficina(remoto.configuracao, baseLocal.configuracao, {
      fonteVerdadeRemota: true,
    }),
    clientes: remoto.clientes,
    motos: remoto.motos,
    ordens_servico: remoto.ordens_servico,
    proximo_numero_os: remoto.proximo_numero_os,
  }
}

/** Remove clientes duplicados no Supabase após mesclagem confirmada pelo usuário */
export async function removerClientesSupabasePorIdsLocais(
  officeUuid: string,
  localIds: string[]
): Promise<{ removidos: number; erros: string[] }> {
  if (!isSupabaseConfigured() || localIds.length === 0) {
    return { removidos: 0, erros: [] }
  }

  const supabase = getSupabaseClient()
  if (!supabase) return { removidos: 0, erros: ['Cliente Supabase indisponível'] }

  const uuids = await Promise.all(
    localIds.map(async (id) => obterUuidPorLocalId(id) ?? (await localIdParaUuid(id)))
  )
  const { error, count } = await supabase
    .from('customers')
    .delete({ count: 'exact' })
    .eq('office_id', officeUuid)
    .in('id', uuids)

  if (error) {
    return { removidos: 0, erros: [formatarErroSupabaseParaUsuario(error)] }
  }

  return { removidos: count ?? localIds.length, erros: [] }
}
