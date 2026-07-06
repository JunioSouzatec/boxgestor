import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import {
  mapearHistoricoDoSupabase,
  mapearHistoricoParaSupabase,
  type CommunicationHistoryRow,
} from '@/services/comunicacao/comunicacao-mappers'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import type { SyncErro } from '@/services/supabase-sync/supabase-sync.types'
import type { HistoricoContato } from '@/types/comunicacao'

export interface ResultadoCarregamentoComunicacao {
  ok: boolean
  dados: HistoricoContato[] | null
  erros: SyncErro[]
}

export interface ResultadoPersistenciaComunicacao {
  ok: boolean
  erros: SyncErro[]
  enviados: number
}

async function resolverOfficeUuid(officeIdLocal: string): Promise<string | null> {
  const contexto = await obterContextoOfficeSupabase(officeIdLocal)
  return contexto?.officeUuid ?? null
}

function sanitizarLinha(linha: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(linha)) {
    if (valor !== undefined) out[chave] = valor
  }
  return out
}

export async function carregarHistoricoDoSupabase(
  officeIdLocal: string
): Promise<ResultadoCarregamentoComunicacao> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Comunicação', mensagem: 'Supabase não configurado' }],
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Comunicação', mensagem: 'Cliente Supabase indisponível' }],
    }
  }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Comunicação', mensagem: 'Sem office_id no perfil' }],
    }
  }

  const { data, error } = await supabase
    .from('communication_history')
    .select('*')
    .eq('office_id', officeUuid)
    .order('sent_at', { ascending: false })

  if (error) {
    registrarUltimoErroSupabase({
      mensagem: error.message,
      entidade: 'communication_history',
    })
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Histórico comunicação', mensagem: error.message }],
    }
  }

  const historico: HistoricoContato[] = []
  for (const row of (data ?? []) as CommunicationHistoryRow[]) {
    historico.push(await mapearHistoricoDoSupabase(row, officeIdLocal))
  }

  return { ok: true, dados: historico, erros: [] }
}

export async function inserirHistoricoNoSupabase(
  officeIdLocal: string,
  registro: HistoricoContato
): Promise<ResultadoPersistenciaComunicacao> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      erros: [{ entidade: 'Comunicação', mensagem: 'Supabase não configurado' }],
      enviados: 0,
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      erros: [{ entidade: 'Comunicação', mensagem: 'Cliente Supabase indisponível' }],
      enviados: 0,
    }
  }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return {
      ok: false,
      erros: [{ entidade: 'Comunicação', mensagem: 'Sem office_id no perfil' }],
      enviados: 0,
    }
  }

  const row = await mapearHistoricoParaSupabase(registro, officeUuid)
  const { error } = await supabase
    .from('communication_history')
    .upsert(sanitizarLinha(row as unknown as Record<string, unknown>) as never, {
      onConflict: 'office_id,local_id',
      ignoreDuplicates: false,
    })

  if (error) {
    registrarUltimoErroSupabase({
      mensagem: error.message,
      entidade: 'communication_history',
    })
    return {
      ok: false,
      erros: [{ entidade: 'Histórico comunicação', mensagem: error.message }],
      enviados: 0,
    }
  }

  return { ok: true, erros: [], enviados: 1 }
}

export async function migrarHistoricoLocalParaSupabase(
  officeIdLocal: string,
  registros: HistoricoContato[]
): Promise<ResultadoPersistenciaComunicacao> {
  if (!isSupabaseConfigured() || registros.length === 0) {
    return { ok: true, erros: [], enviados: 0 }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      erros: [{ entidade: 'Comunicação', mensagem: 'Cliente Supabase indisponível' }],
      enviados: 0,
    }
  }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return {
      ok: false,
      erros: [{ entidade: 'Comunicação', mensagem: 'Sem office_id no perfil' }],
      enviados: 0,
    }
  }

  const linhas: Record<string, unknown>[] = []
  for (const registro of registros) {
    const row = await mapearHistoricoParaSupabase(registro, officeUuid)
    linhas.push(sanitizarLinha(row as unknown as Record<string, unknown>))
  }

  const { error } = await supabase.from('communication_history').upsert(linhas as never[], {
    onConflict: 'office_id,local_id',
    ignoreDuplicates: true,
  })

  if (error) {
    registrarUltimoErroSupabase({
      mensagem: error.message,
      entidade: 'communication_history',
    })
    return {
      ok: false,
      erros: [{ entidade: 'Histórico comunicação', mensagem: error.message }],
      enviados: 0,
    }
  }

  return { ok: true, erros: [], enviados: linhas.length }
}
