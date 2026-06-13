import { Badge } from '@/components/ui/badge'
import type { StatusAgendamento, StatusOS, StatusOrcamento } from '@/types'
import { getLabelStatusAgendamento, getLabelStatusOS, getLabelStatusOrcamento } from '@/types'

const statusOSVariant: Record<StatusOS, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  recebida: 'info',
  em_diagnostico: 'warning',
  aguardando_aprovacao: 'warning',
  aguardando_peca: 'warning',
  em_servico: 'default',
  finalizada: 'success',
  entregue: 'success',
  cancelada: 'destructive',
}

const statusAgendamentoVariant: Record<
  StatusAgendamento,
  'default' | 'info' | 'warning' | 'success' | 'destructive'
> = {
  agendado: 'info',
  confirmado: 'default',
  em_atendimento: 'warning',
  concluido: 'success',
  cancelado: 'destructive',
}

export function StatusOSBadge({ status }: { status: StatusOS }) {
  return <Badge variant={statusOSVariant[status]}>{getLabelStatusOS(status)}</Badge>
}

export function StatusAgendamentoBadge({ status }: { status: StatusAgendamento }) {
  return (
    <Badge variant={statusAgendamentoVariant[status]}>
      {getLabelStatusAgendamento(status)}
    </Badge>
  )
}

export function EstoqueBadge({ quantidade, minimo }: { quantidade: number; minimo: number }) {
  if (quantidade <= 0) {
    return <Badge variant="destructive">Sem estoque</Badge>
  }
  if (quantidade <= minimo) {
    return <Badge variant="warning">Estoque baixo</Badge>
  }
  return <Badge variant="success">Normal</Badge>
}

const statusOrcamentoVariant: Record<
  StatusOrcamento,
  'default' | 'info' | 'warning' | 'success' | 'destructive'
> = {
  aguardando_aprovacao: 'warning',
  aprovado: 'success',
  reprovado: 'destructive',
}

export function StatusOrcamentoBadge({ status }: { status: StatusOrcamento }) {
  return (
    <Badge variant={statusOrcamentoVariant[status]}>
      {getLabelStatusOrcamento(status)}
    </Badge>
  )
}

export function GarantiaAtivaBadge() {
  return (
    <Badge variant="success" className="gap-1">
      Em garantia
    </Badge>
  )
}
