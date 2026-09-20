import { obterIdentidadeApp } from '@/lib/app-versao'
import type { Agendamento } from '@/types/agendamento'

export const PREFIXO_APT_ORIGEM_DIAG = 'd71945fa'

function logsOrigemHabilitados(): boolean {
  try {
    const url = String(import.meta.env?.VITE_SUPABASE_URL ?? '')
    return url.includes('cqnktgouczyrxkkeusio') && !url.includes('fgarivlagocabyumniiz')
  } catch {
    return false
  }
}

export function encontrarAppointmentOrigemDiag(
  agendamentos: Agendamento[] | undefined
): Agendamento | undefined {
  return (agendamentos ?? []).find((a) => a.id.startsWith(PREFIXO_APT_ORIGEM_DIAG))
}

export function logAgendaOrigem(input: {
  etapa: string
  agendamentos?: Agendamento[]
  source?: string
  tentativaId?: string
  trailing?: boolean
  extra?: Record<string, unknown>
}): void {
  if (!logsOrigemHabilitados()) return
  const ag = encontrarAppointmentOrigemDiag(input.agendamentos)
  const identidade = obterIdentidadeApp({
    supabaseUrl: import.meta.env?.VITE_SUPABASE_URL,
  })
  const payload: Record<string, unknown> = {
    etapa: input.etapa,
    temD719: Boolean(ag),
    quantidadeAgendamentos: input.agendamentos?.length ?? 0,
    source: input.source ?? null,
    tentativaId: input.tentativaId ?? null,
    trailing: Boolean(input.trailing),
    timestamp: new Date().toISOString(),
    versao: identidade.versaoAmigavel,
    build: identidade.buildCurto,
    ...(input.extra ?? {}),
  }
  if (ag) {
    payload.appointmentId = ag.id
    payload.clienteId = ag.cliente_id
    payload.motoId = ag.moto_id
    payload.deletedAt = ag.deleted_at ?? null
    payload.updatedAt = ag.updated_at ?? null
  }
  console.info('[BoxGestor Agenda][origem]', payload)
}
