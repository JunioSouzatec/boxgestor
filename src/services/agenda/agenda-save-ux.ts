import { APP_DEPLOY_VERSION } from '@/generated/app-version'
import { MSG } from '@/lib/mensagens-usuario'
import type { AgendaFkId, AgendaPushEtapa } from '@/services/agenda/agenda-push'

export const MAPPER_AGENDA_HOMOLOG = 'uuid-first-v2'

export const SUPABASE_REF_HOMOLOG = 'cqnktgouczyrxkkeusio'
export const SUPABASE_REF_PRODUCTION = 'fgarivlagocabyumniiz'

export interface ResultadoSaveAgenda {
  ok: boolean
  syncHabilitado: boolean
  etapa?: AgendaPushEtapa
  tentativaId?: string
  supabaseCode?: string
  supabaseMessage?: string
  supabaseDetails?: string
  supabaseHint?: string
  fkIds?: AgendaFkId[]
  motivoLocal?: 'nao_encontrado' | 'conflito_local'
}

export interface OpcoesToastAgenda {
  diagnosticoEtapa?: boolean
}

export function diagnosticoPushAgendaVisivel(
  supabaseUrl?: string | null
): boolean {
  const url = supabaseUrl ?? ''
  if (!url || url.includes(SUPABASE_REF_PRODUCTION)) return false
  return url.includes(SUPABASE_REF_HOMOLOG)
}

function idCurtoAgenda(id: string | undefined): string {
  const t = id?.trim() ?? ''
  return t.slice(0, 8) || '?'
}

function constraintFkAgenda(mensagem?: string): string | undefined {
  const m = mensagem?.match(/\b(appointments_[a-z0-9_]+_fkey)\b/i)
  return m?.[1]
}

function mensagemToastFk23503(resultado: ResultadoSaveAgenda): string {
  const linhas = [
    `Agenda pendente: ${resultado.etapa ?? 'upsert_falhou'} (${resultado.supabaseCode ?? '23503'})`,
  ]
  for (const fk of resultado.fkIds ?? []) {
    linhas.push(`apt=${idCurtoAgenda(fk.appointmentId)}`)
    linhas.push(`entradaCliente=${fk.clienteIdEntrada ?? ''}`)
    linhas.push(`customerFinal=${fk.customerIdFinal ?? fk.customerId}`)
    linhas.push(`entradaMoto=${fk.motoIdEntrada ?? ''}`)
    linhas.push(`motorcycleFinal=${fk.motorcycleIdFinal ?? fk.motorcycleId}`)
  }
  linhas.push(`mapper=${MAPPER_AGENDA_HOMOLOG}`)
  linhas.push(`build=${APP_DEPLOY_VERSION}`)
  linhas.push(
    `FK: ${constraintFkAgenda(resultado.supabaseMessage) ?? 'appointments_customer_id_fkey'}`
  )
  return linhas.join('\n')
}

function mensagemPendenteComEtapa(
  resultado: ResultadoSaveAgenda,
  exclusao: boolean
): string {
  if (resultado.supabaseCode === '23503') {
    return mensagemToastFk23503(resultado)
  }
  const sufixo = resultado.etapa ? `: ${resultado.etapa}.` : '.'
  const linhas = [
    exclusao
      ? `Exclusão salva neste dispositivo.\nSincronização pendente${sufixo}`
      : `Agendamento salvo neste dispositivo.\nSincronização pendente${sufixo}`,
  ]
  if (
    resultado.etapa === 'upsert_falhou' ||
    resultado.etapa === 'upsert_parcial'
  ) {
    if (resultado.supabaseCode) {
      linhas.push(`Código: ${resultado.supabaseCode}`)
    }
    if (resultado.supabaseMessage) {
      linhas.push(`Motivo: ${resultado.supabaseMessage}`)
    }
    for (const fk of resultado.fkIds ?? []) {
      linhas.push(
        `${fk.appointmentId} customer=${fk.customerId} motorcycle=${fk.motorcycleId}`
      )
    }
  }
  return linhas.join('\n')
}

export function mensagemToastSaveAgenda(
  resultado: ResultadoSaveAgenda,
  opcoes?: OpcoesToastAgenda
): string {
  if (resultado.motivoLocal === 'nao_encontrado' || resultado.motivoLocal === 'conflito_local') {
    return MSG.agendamentoNaoDisponivel
  }
  if (!resultado.syncHabilitado || resultado.ok) return MSG.agendamentoSalvo
  if (opcoes?.diagnosticoEtapa) {
    return mensagemPendenteComEtapa(resultado, false)
  }
  return MSG.agendamentoSalvoPendenteSync
}

export function mensagemToastExclusaoAgenda(
  resultado: ResultadoSaveAgenda,
  opcoes?: OpcoesToastAgenda
): string {
  if (resultado.motivoLocal === 'nao_encontrado' || resultado.motivoLocal === 'conflito_local') {
    return MSG.agendamentoNaoDisponivel
  }
  if (!resultado.syncHabilitado || resultado.ok) return MSG.agendamentoExcluido
  if (opcoes?.diagnosticoEtapa) {
    return mensagemPendenteComEtapa(resultado, true)
  }
  return MSG.agendamentoExcluidoPendenteSync
}
