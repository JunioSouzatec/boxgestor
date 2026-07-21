import { Badge } from '@/components/ui/badge'
import type { StatusAgendamento, StatusFinanceiroOS, StatusOS, StatusOrcamento } from '@/types'
import {
  getLabelStatusAgendamento,
  getLabelStatusFinanceiroOS,
  getLabelStatusOS,
  getLabelStatusOrcamento,
} from '@/types'
import {
  obterLabelCondicaoFinanceiraOS,
  osAguardandoPagamento,
} from '@/services/os-financeiro.service'

const statusOSVariant: Record<StatusOS, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  recebida: 'info',
  em_diagnostico: 'warning',
  aguardando_aprovacao: 'warning',
  aguardando_peca: 'warning',
  em_servico: 'default',
  pronto_para_retirada: 'info',
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
  'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'
> = {
  rascunho: 'secondary',
  enviado: 'info',
  aguardando_aprovacao: 'info',
  aprovado: 'success',
  recusado: 'destructive',
  convertido: 'default',
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

const statusFinanceiroVariant: Record<
  StatusFinanceiroOS,
  'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'
> = {
  nao_pago: 'destructive',
  parcialmente_pago: 'warning',
  pago: 'success',
  pendente: 'warning',
  cancelado: 'secondary',
}

export function StatusFinanceiroBadge({ status }: { status: StatusFinanceiroOS }) {
  return (
    <Badge variant={statusFinanceiroVariant[status]}>
      {getLabelStatusFinanceiroOS(status)}
    </Badge>
  )
}

/**
 * Condição financeira da OS (RC2 Fase 3B.2): badge de leitura rápida que deixa
 * claro quando há saldo pendente ("Aguardando pagamento"), sem ser status
 * operacional. Baseado no resumo financeiro já calculado.
 */
export function CondicaoFinanceiraOSBadge({
  statusFinanceiro,
  valorPendente,
}: {
  statusFinanceiro: StatusFinanceiroOS
  valorPendente: number
}) {
  const aguardando = osAguardandoPagamento(statusFinanceiro, valorPendente)
  const variant: 'success' | 'warning' | 'secondary' =
    statusFinanceiro === 'cancelado' ? 'secondary' : aguardando ? 'warning' : 'success'
  return (
    <Badge variant={variant} className="text-xs">
      {obterLabelCondicaoFinanceiraOS(statusFinanceiro, valorPendente)}
    </Badge>
  )
}
