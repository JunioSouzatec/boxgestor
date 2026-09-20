import { repararRegistryFksAposPullAgenda } from '@/services/agenda/agenda-mappers'
import { mesclarAgendamentos } from '@/services/agenda/agenda-merge'
import { agoraIso, identidadeLogAgenda } from '@/services/agenda/agenda-realtime-scheduler'
import type { Agendamento } from '@/types'

export interface ResultadoSelectAgendaPullCore {
  ok: boolean
  dados: Agendamento[] | null
}

function logPull(detalhe: Record<string, unknown>): void {
  console.info('[BoxGestor Agenda][pull]', { ...identidadeLogAgenda(), ...detalhe })
}

export async function aplicarPullAgendaDirecionado(input: {
  officeId: string
  pullId?: string
  trailing?: boolean
  carregarLocal: () => { agendamentos?: Agendamento[] }
  carregarRemoto: () => Promise<ResultadoSelectAgendaPullCore>
  salvarLocal: (agendamentos: Agendamento[]) => void
  onUi?: (agendamentos: Agendamento[]) => void
  persistir?: (agendamentos: Agendamento[]) => Promise<unknown>
}): Promise<{ ok: boolean; disparouPush: boolean; agendamentos: Agendamento[] | null }> {
  const pullId = input.pullId ?? `agp-${Date.now().toString(36)}`
  const trailing = Boolean(input.trailing)
  const startedAt = agoraIso()
  const inicio = performance.now()
  logPull({
    officeId: input.officeId,
    pullId,
    startedAt,
    trailing,
    etapa: 'inicio',
    motivo: 'agenda_realtime',
  })

  const selectStartedAt = agoraIso()
  const selectInicio = performance.now()
  logPull({
    officeId: input.officeId,
    pullId,
    trailing,
    etapa: 'select_appointments_inicio',
    selectStartedAt,
  })
  const remoto = await input.carregarRemoto()
  const selectFinishedAt = agoraIso()
  const selectDurationMs = Math.round(performance.now() - selectInicio)
  logPull({
    officeId: input.officeId,
    pullId,
    trailing,
    etapa: 'select_appointments_fim',
    selectStartedAt,
    selectFinishedAt,
    selectDurationMs,
    rows: remoto.dados?.length ?? 0,
    ok: Boolean(remoto.ok && remoto.dados),
  })

  if (!remoto.ok || !remoto.dados) {
    const finishedAt = agoraIso()
    logPull({
      officeId: input.officeId,
      pullId,
      trailing,
      etapa: 'fim',
      ok: false,
      motivo: 'select_falhou',
      startedAt,
      selectStartedAt,
      selectFinishedAt,
      selectDurationMs,
      rows: 0,
      onUiAt: null,
      finishedAt,
      durationMs: Math.round(performance.now() - inicio),
      disparou_push: false,
    })
    return { ok: false, disparouPush: false, agendamentos: null }
  }

  const mesclados = mesclarAgendamentos(input.carregarLocal().agendamentos ?? [], remoto.dados)
  const mergeFinishedAt = agoraIso()
  repararRegistryFksAposPullAgenda(mesclados, remoto.dados)
  input.salvarLocal(mesclados)
  const localSaveFinishedAt = agoraIso()
  const onUiAt = agoraIso()
  input.onUi?.(mesclados)
  const finishedAt = agoraIso()

  logPull({
    officeId: input.officeId,
    pullId,
    trailing,
    etapa: 'fim',
    ok: true,
    motivo: 'agenda_realtime',
    startedAt,
    selectStartedAt,
    selectFinishedAt,
    selectDurationMs,
    rows: remoto.dados.length,
    mergeFinishedAt,
    localSaveFinishedAt,
    onUiAt,
    finishedAt,
    durationMs: Math.round(performance.now() - inicio),
    disparou_push: false,
  })

  return { ok: true, disparouPush: false, agendamentos: mesclados }
}
