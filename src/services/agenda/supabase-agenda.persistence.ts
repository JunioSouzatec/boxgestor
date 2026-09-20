import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import {
  logAgendaPush,
  montarAgendaFkId,
  sanitizarTextoErroAgenda,
  type AgendaFkId,
} from '@/services/agenda/agenda-push'
import {
  indexarFksTecnicasPorAppointmentId,
  type AgendaFksTecnicasRemotas,
} from '@/services/agenda/agenda-fk-canonico'
import {
  mapearAgendamentoDoSupabase,
  mapearAgendamentoParaSupabase,
  type AppointmentRow,
} from '@/services/agenda/agenda-mappers'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import type { SyncErro } from '@/services/supabase-sync/supabase-sync.types'
import type { Agendamento } from '@/types'

const TAMANHO_LOTE = 50

export interface ResultadoPersistenciaAgenda {
  ok: boolean
  erros: SyncErro[]
  enviados: number
  loteIds?: string[]
  loteTamanho?: number
  fkIds?: AgendaFkId[]
}

export interface ResultadoCarregamentoAgenda {
  ok: boolean
  dados: Agendamento[] | null
  erros: SyncErro[]
  fksTecnicasPorId?: Record<string, AgendaFksTecnicasRemotas>
}

function sanitizarLinha(linha: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(linha)) {
    if (valor !== undefined) out[chave] = valor
  }
  return out
}

export async function carregarAgendamentosDoSupabase(
  officeIdLocal: string
): Promise<ResultadoCarregamentoAgenda> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Agendamento', mensagem: 'Supabase não configurado' }],
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Agendamento', mensagem: 'Cliente Supabase indisponível' }],
    }
  }

  const contexto = await obterContextoOfficeSupabase(officeIdLocal)
  const officeUuid = contexto?.officeUuid
  if (!officeUuid) {
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Agendamento', mensagem: 'Sem office_id no perfil' }],
    }
  }

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('office_id', officeUuid)

  if (error) {
    registrarUltimoErroSupabase({
      mensagem: error.message,
      entidade: 'agendamentos',
    })
    logAgendaPush({
      etapa: 'select_remoto',
      ok: false,
      codigo: error.code,
      mensagem: error.message.slice(0, 160),
      supabaseCode: error.code,
    })
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Agendamento', mensagem: error.message, codigo: error.code }],
    }
  }

  const rows = ((data ?? []) as AppointmentRow[])
  const fksTecnicasPorId = indexarFksTecnicasPorAppointmentId(rows)
  const agendamentos = rows.map((row) =>
    mapearAgendamentoDoSupabase(row, officeIdLocal)
  )

  return { ok: true, dados: agendamentos, erros: [], fksTecnicasPorId }
}

export async function persistirAgendamentosNoSupabase(
  officeIdLocal: string,
  agendamentos: Agendamento[]
): Promise<ResultadoPersistenciaAgenda> {
  if (agendamentos.length === 0) {
    return { ok: true, erros: [], enviados: 0 }
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      erros: [{ entidade: 'Agendamento', mensagem: 'Supabase não configurado' }],
      enviados: 0,
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      erros: [{ entidade: 'Agendamento', mensagem: 'Cliente Supabase indisponível' }],
      enviados: 0,
    }
  }

  const contexto = await obterContextoOfficeSupabase(officeIdLocal)
  const officeUuid = contexto?.officeUuid
  if (!officeUuid) {
    return {
      ok: false,
      erros: [{ entidade: 'Agendamento', mensagem: 'Sem office_id no perfil' }],
      enviados: 0,
    }
  }

  const linhas: Record<string, unknown>[] = []
  const fkIds: AgendaFkId[] = []
  const erros: SyncErro[] = []

  for (const ag of agendamentos) {
    const row = await mapearAgendamentoParaSupabase(ag, officeUuid)
    if (!row) {
      erros.push({
        entidade: 'Agendamento',
        id: ag.id,
        mensagem: 'Agendamento sem cliente/veículo UUID válido para o remoto',
      })
      continue
    }
    const sanitizada = sanitizarLinha(row)
    linhas.push(sanitizada)
    fkIds.push(montarAgendaFkId(ag, sanitizada))
  }

  if (linhas.length === 0) {
    if (erros.length > 0) {
      registrarUltimoErroSupabase({
        mensagem: erros[0]?.mensagem ?? 'Erro ao mapear agendamentos',
        entidade: 'agendamentos',
      })
    }
    return { ok: erros.length === 0, erros, enviados: 0 }
  }

  let enviados = 0
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE)
    const loteIds = lote.map((row) => String(row.id ?? ''))
    const fkLote = fkIds.filter((fk) => loteIds.includes(fk.appointmentId))
    const { error } = await supabase.from('appointments').upsert(lote as never[], {
      onConflict: 'id',
    })
    if (error) {
      erros.push({
        entidade: 'Agendamento',
        mensagem: error.message,
        codigo: error.code,
        details: error.details,
        hint: error.hint,
        erro_tecnico: [error.details, error.hint].filter(Boolean).join(' | ') || undefined,
      })
      registrarUltimoErroSupabase({
        mensagem: error.message,
        entidade: 'agendamentos',
      })
      logAgendaPush({
        etapa: 'upsert_lote',
        ok: false,
        codigo: error.code,
        mensagem: sanitizarTextoErroAgenda(error.message),
        details: sanitizarTextoErroAgenda(error.details),
        hint: sanitizarTextoErroAgenda(error.hint),
        lote_tamanho: lote.length,
        lote_ids: loteIds,
        fk_ids: fkLote,
        supabaseCode: error.code,
      })
      continue
    }
    enviados += lote.length
  }

  const loteIds = linhas.map((row) => String(row.id ?? ''))
  // Fila office-level só limpa com snapshot inteiro confirmado.
  return {
    ok: erros.length === 0,
    erros,
    enviados,
    loteIds,
    loteTamanho: linhas.length,
    fkIds,
  }
}
