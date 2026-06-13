import type { Agendamento, OrdemServico } from '@/types'

export function obterNumeroOSAgendamento(
  agendamento: Agendamento,
  ordens: OrdemServico[]
): number | null {
  if (agendamento.ordem_servico_id) {
    const os = ordens.find((o) => o.id === agendamento.ordem_servico_id)
    if (os) return os.numero
  }
  const match = agendamento.servico.match(/OS\s*#?\s*(\d+)/i)
  return match ? Number(match[1]) : null
}
