import { repararRegistryFksAposPullAgenda } from '@/services/agenda/agenda-mappers'
import { mesclarAgendamentos } from '@/services/agenda/agenda-merge'
import { agoraIso, identidadeLogAgenda } from '@/services/agenda/agenda-realtime-scheduler'
import type { Agendamento } from '@/types'

export interface ResultadoSelectAgendaPullCore {
  ok: boolean
  dados: Agendamento[] | null
}

function logPull(detalhe: Record<string, unknown>): void {
  if (detalhe.ok !== false && detalhe.erro == null) return
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

  const selectStartedAt = agoraIso()
  const selectInicio = performance.now()
  const remoto = await input.carregarRemoto()
  const selectFinishedAt = agoraIso()
  const selectDurationMs = Math.round(performance.now() - selectInicio)

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
  repararRegistryFksAposPullAgenda(mesclados, remoto.dados)
  input.salvarLocal(mesclados)
  input.onUi?.(mesclados)

  return { ok: true, disparouPush: false, agendamentos: mesclados }
}
