import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import type { SyncErro } from '@/services/supabase-sync/supabase-sync.types'
import {
  mapearHistoricoDoSupabase,
  mapearHistoricoParaSupabase,
  mapearLembreteDoSupabase,
  mapearLembreteParaSupabase,
  mapearRegraLembreteDoSupabase,
  mapearRegraLembreteParaSupabase,
  type LembreteHistoricoRow,
  type LembreteRow,
  type RegraLembreteRow,
} from '@/services/lembretes/lembretes-mappers'
import type {
  LembreteCliente,
  RegistroHistoricoLembrete,
  RegraLembrete,
} from '@/types/lembrete'

export interface LembretesOfficeRemoto {
  regras: RegraLembrete[]
  lembretes: LembreteCliente[]
}

export interface ResultadoPersistenciaLembretes {
  ok: boolean
  erros: SyncErro[]
  enviados: {
    regras: number
    lembretes: number
    historico: number
  }
}

export interface ResultadoCarregamentoLembretes {
  ok: boolean
  dados: LembretesOfficeRemoto | null
  erros: SyncErro[]
}

function sanitizarLinha(linha: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(linha)) {
    if (valor !== undefined) out[chave] = valor
  }
  return out
}

async function resolverOfficeUuid(officeIdLocal: string): Promise<string | null> {
  const contexto = await obterContextoOfficeSupabase(officeIdLocal)
  return contexto?.officeUuid ?? null
}

export async function carregarLembretesDoSupabase(
  officeIdLocal: string
): Promise<ResultadoCarregamentoLembretes> {
  if (!isSupabaseConfigured()) {
    return { ok: false, dados: null, erros: [{ entidade: 'Lembretes', mensagem: 'Supabase não configurado' }] }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, dados: null, erros: [{ entidade: 'Lembretes', mensagem: 'Cliente Supabase indisponível' }] }
  }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return { ok: false, dados: null, erros: [{ entidade: 'Lembretes', mensagem: 'Sem office_id no perfil' }] }
  }

  const erros: SyncErro[] = []

  const [regrasRes, lembretesRes, historicoRes] = await Promise.all([
    supabase.from('regras_lembrete').select('*').eq('office_id', officeUuid),
    supabase.from('lembretes').select('*').eq('office_id', officeUuid),
    supabase.from('lembretes_historico').select('*').eq('office_id', officeUuid).order('data', { ascending: false }),
  ])

  if (regrasRes.error) erros.push({ entidade: 'Regra de lembrete', mensagem: regrasRes.error.message })
  if (lembretesRes.error) erros.push({ entidade: 'Lembrete', mensagem: lembretesRes.error.message })
  if (historicoRes.error) erros.push({ entidade: 'Histórico lembrete', mensagem: historicoRes.error.message })

  if (erros.length > 0) {
    registrarUltimoErroSupabase({
      mensagem: erros[0]?.mensagem ?? 'Erro ao carregar lembretes',
      entidade: 'lembretes',
    })
    return { ok: false, dados: null, erros }
  }

  const historicoPorLembrete = new Map<string, RegistroHistoricoLembrete[]>()
  for (const row of (historicoRes.data ?? []) as LembreteHistoricoRow[]) {
    const { lembreteLocalId, registro } = await mapearHistoricoDoSupabase(row, officeIdLocal)
    const lista = historicoPorLembrete.get(lembreteLocalId) ?? []
    if (!lista.some((h) => h.id === registro.id)) {
      lista.push(registro)
      historicoPorLembrete.set(lembreteLocalId, lista)
    }
  }

  const regras: RegraLembrete[] = []
  for (const row of (regrasRes.data ?? []) as RegraLembreteRow[]) {
    regras.push(await mapearRegraLembreteDoSupabase(row, officeIdLocal))
  }

  const lembretes: LembreteCliente[] = []
  for (const row of (lembretesRes.data ?? []) as LembreteRow[]) {
    const localId = row.local_id?.trim() ?? row.id
    const historico =
      historicoPorLembrete.get(localId) ??
      historicoPorLembrete.get(row.local_id ?? '') ??
      []
    lembretes.push(await mapearLembreteDoSupabase(row, officeIdLocal, historico))
  }

  return {
    ok: true,
    dados: { regras, lembretes },
    erros: [],
  }
}

export async function persistirLembretesNoSupabase(
  officeIdLocal: string,
  regras: RegraLembrete[],
  lembretes: LembreteCliente[]
): Promise<ResultadoPersistenciaLembretes> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      erros: [{ entidade: 'Lembretes', mensagem: 'Supabase não configurado' }],
      enviados: { regras: 0, lembretes: 0, historico: 0 },
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      erros: [{ entidade: 'Lembretes', mensagem: 'Cliente Supabase indisponível' }],
      enviados: { regras: 0, lembretes: 0, historico: 0 },
    }
  }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return {
      ok: false,
      erros: [{ entidade: 'Lembretes', mensagem: 'Sem office_id no perfil' }],
      enviados: { regras: 0, lembretes: 0, historico: 0 },
    }
  }

  const erros: SyncErro[] = []
  let enviadosRegras = 0
  let enviadosLembretes = 0
  let enviadosHistorico = 0

  for (const regra of regras) {
    const row = await mapearRegraLembreteParaSupabase(regra, officeUuid)
    const { error } = await supabase
      .from('regras_lembrete')
      .upsert(sanitizarLinha(row as unknown as Record<string, unknown>) as never, { onConflict: 'id' })
    if (error) {
      erros.push({ entidade: 'Regra de lembrete', id: regra.id, mensagem: error.message })
    } else {
      enviadosRegras++
    }
  }

  for (const lembrete of lembretes) {
    const row = await mapearLembreteParaSupabase(lembrete, officeUuid)
    const { error } = await supabase
      .from('lembretes')
      .upsert(sanitizarLinha(row as unknown as Record<string, unknown>) as never, { onConflict: 'id' })
    if (error) {
      erros.push({ entidade: 'Lembrete', id: lembrete.id, mensagem: error.message })
      continue
    }
    enviadosLembretes++

    for (const registro of lembrete.historico ?? []) {
      const histRow = await mapearHistoricoParaSupabase(lembrete, registro, officeUuid)
      const { error: histError } = await supabase
        .from('lembretes_historico')
        .upsert(sanitizarLinha(histRow as unknown as Record<string, unknown>) as never, { onConflict: 'id' })
      if (histError) {
        erros.push({ entidade: 'Histórico lembrete', id: registro.id, mensagem: histError.message })
      } else {
        enviadosHistorico++
      }
    }
  }

  if (erros.length > 0) {
    registrarUltimoErroSupabase({
      mensagem: erros[0]?.mensagem ?? 'Erro ao salvar lembretes',
      entidade: 'lembretes',
    })
  }

  return {
    ok: erros.length === 0,
    erros,
    enviados: {
      regras: enviadosRegras,
      lembretes: enviadosLembretes,
      historico: enviadosHistorico,
    },
  }
}

export async function contarLembretesNoSupabase(officeIdLocal: string): Promise<{
  regras: number
  lembretes: number
  historico: number
  erro?: string
}> {
  if (!isSupabaseConfigured()) return { regras: 0, lembretes: 0, historico: 0, erro: 'Não configurado' }

  const supabase = getSupabaseClient()
  if (!supabase) return { regras: 0, lembretes: 0, historico: 0, erro: 'Sem cliente' }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) return { regras: 0, lembretes: 0, historico: 0, erro: 'Sem office_id' }

  const [r, l, h] = await Promise.all([
    supabase.from('regras_lembrete').select('id', { count: 'exact', head: true }).eq('office_id', officeUuid),
    supabase.from('lembretes').select('id', { count: 'exact', head: true }).eq('office_id', officeUuid),
    supabase.from('lembretes_historico').select('id', { count: 'exact', head: true }).eq('office_id', officeUuid),
  ])

  return {
    regras: r.count ?? 0,
    lembretes: l.count ?? 0,
    historico: h.count ?? 0,
    erro: r.error?.message ?? l.error?.message ?? h.error?.message,
  }
}
