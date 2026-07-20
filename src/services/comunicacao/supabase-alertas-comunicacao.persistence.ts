import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { aguardarSessaoAuthSupabase } from '@/lib/supabase-session-ready'
import {
  mapearAlertaDoSupabase,
  mapearAlertaParaSupabase,
  type CommunicationAlertRow,
} from '@/services/comunicacao/alertas-comunicacao-mappers'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import type { SyncErro } from '@/services/supabase-sync/supabase-sync.types'
import {
  abrirCircuitSyncModulo,
  circuitSyncModuloAberto,
  fecharCircuitSyncModulo,
  isErroAuthOuPermissao,
} from '@/services/sync/remote-sync-circuit'
import type { AlertaComunicacao } from '@/types/alerta-comunicacao'

export interface ResultadoCarregamentoAlertas {
  ok: boolean
  dados: AlertaComunicacao[] | null
  erros: SyncErro[]
}

export interface ResultadoPersistenciaAlertas {
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

export async function carregarAlertasDoSupabase(
  officeIdLocal: string
): Promise<ResultadoCarregamentoAlertas> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Alertas', mensagem: 'Supabase não configurado' }],
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Alertas', mensagem: 'Cliente Supabase indisponível' }],
    }
  }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Alertas', mensagem: 'Sem office_id no perfil' }],
    }
  }

  const { data, error } = await supabase
    .from('communication_alerts')
    .select('*')
    .eq('office_id', officeUuid)
    .order('due_date', { ascending: true })

  if (error) {
    registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'communication_alerts' })
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Alerta comunicação', mensagem: error.message }],
    }
  }

  const alertas: AlertaComunicacao[] = []
  for (const row of (data ?? []) as CommunicationAlertRow[]) {
    alertas.push(await mapearAlertaDoSupabase(row, officeIdLocal))
  }

  return { ok: true, dados: alertas, erros: [] }
}

export async function persistirAlertaNoSupabase(
  officeIdLocal: string,
  alerta: AlertaComunicacao
): Promise<ResultadoPersistenciaAlertas> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      erros: [{ entidade: 'Alertas', mensagem: 'Supabase não configurado' }],
      enviados: 0,
    }
  }

  if (circuitSyncModuloAberto('communication_alerts', officeIdLocal)) {
    return {
      ok: false,
      erros: [{ entidade: 'Alertas', mensagem: 'Sync alertas pausado após erro de autenticação' }],
      enviados: 0,
    }
  }

  const sessao = await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
  if (!sessao) {
    return {
      ok: false,
      erros: [{ entidade: 'Alertas', mensagem: 'Sem sessão Auth' }],
      enviados: 0,
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      erros: [{ entidade: 'Alertas', mensagem: 'Cliente Supabase indisponível' }],
      enviados: 0,
    }
  }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return {
      ok: false,
      erros: [{ entidade: 'Alertas', mensagem: 'Sem office_id no perfil' }],
      enviados: 0,
    }
  }

  const row = await mapearAlertaParaSupabase(alerta, officeUuid)
  const { error } = await supabase
    .from('communication_alerts')
    .upsert(sanitizarLinha(row as unknown as Record<string, unknown>) as never, {
      onConflict: 'office_id,local_id',
      ignoreDuplicates: false,
    })

  if (error) {
    if (isErroAuthOuPermissao(error.message)) {
      abrirCircuitSyncModulo('communication_alerts', officeIdLocal, error.message)
    }
    registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'communication_alerts' })
    return {
      ok: false,
      erros: [{ entidade: 'Alerta comunicação', mensagem: error.message }],
      enviados: 0,
    }
  }

  fecharCircuitSyncModulo('communication_alerts', officeIdLocal)
  return { ok: true, erros: [], enviados: 1 }
}

export async function migrarAlertasLocalParaSupabase(
  officeIdLocal: string,
  registros: AlertaComunicacao[]
): Promise<ResultadoPersistenciaAlertas> {
  if (!isSupabaseConfigured() || registros.length === 0) {
    return { ok: true, erros: [], enviados: 0 }
  }

  if (circuitSyncModuloAberto('communication_alerts', officeIdLocal)) {
    return {
      ok: false,
      erros: [{ entidade: 'Alertas', mensagem: 'Sync alertas pausado após erro de autenticação' }],
      enviados: 0,
    }
  }

  const sessao = await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
  if (!sessao) {
    return {
      ok: false,
      erros: [{ entidade: 'Alertas', mensagem: 'Sem sessão Auth' }],
      enviados: 0,
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      erros: [{ entidade: 'Alertas', mensagem: 'Cliente Supabase indisponível' }],
      enviados: 0,
    }
  }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return {
      ok: false,
      erros: [{ entidade: 'Alertas', mensagem: 'Sem office_id no perfil' }],
      enviados: 0,
    }
  }

  const linhas: Record<string, unknown>[] = []
  for (const registro of registros) {
    const row = await mapearAlertaParaSupabase(registro, officeUuid)
    linhas.push(sanitizarLinha(row as unknown as Record<string, unknown>))
  }

  const { error } = await supabase.from('communication_alerts').upsert(linhas as never[], {
    onConflict: 'office_id,local_id',
    ignoreDuplicates: true,
  })

  if (error) {
    if (isErroAuthOuPermissao(error.message)) {
      abrirCircuitSyncModulo('communication_alerts', officeIdLocal, error.message)
    }
    registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'communication_alerts' })
    return {
      ok: false,
      erros: [{ entidade: 'Alerta comunicação', mensagem: error.message }],
      enviados: 0,
    }
  }

  fecharCircuitSyncModulo('communication_alerts', officeIdLocal)
  return { ok: true, erros: [], enviados: linhas.length }
}
