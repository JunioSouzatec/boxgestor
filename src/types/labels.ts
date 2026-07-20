import type {
  ChaveItemChecklist,
  FormaPagamento,
  StatusAgendamento,
  StatusFinanceiroOS,
  StatusOrcamento,
  StatusOS,
} from '@/types/enums'

export const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'debito', label: 'Cartão de débito' },
  { value: 'credito', label: 'Cartão de crédito' },
  { value: 'fiado', label: 'Pendente' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'outro', label: 'Outro' },
]

export const STATUS_FINANCEIRO_OS: { value: StatusFinanceiroOS; label: string }[] = [
  { value: 'nao_pago', label: 'Não pago' },
  { value: 'parcialmente_pago', label: 'Parcialmente pago' },
  { value: 'pago', label: 'Pago' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'cancelado', label: 'Cancelado' },
]

export const STATUS_OS: { value: StatusOS; label: string }[] = [
  { value: 'recebida', label: 'Recebida' },
  { value: 'em_diagnostico', label: 'Em diagnóstico' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
  { value: 'aguardando_peca', label: 'Aguardando peça' },
  { value: 'em_servico', label: 'Em serviço' },
  { value: 'finalizada', label: 'Finalizada' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'cancelada', label: 'Cancelada' },
]

export const STATUS_AGENDAMENTO: { value: StatusAgendamento; label: string }[] = [
  { value: 'agendado', label: 'Agendado' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'em_atendimento', label: 'Em atendimento' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'cancelado', label: 'Cancelado' },
]

export const STATUS_ORCAMENTO: { value: StatusOrcamento; label: string }[] = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'recusado', label: 'Recusado' },
  { value: 'convertido', label: 'Convertido em OS' },
]

export const ITENS_CHECKLIST_ENTRADA: { chave: ChaveItemChecklist; label: string }[] = [
  { chave: 'combustivel', label: 'Combustível' },
  { chave: 'capacete_entregue', label: 'Capacete entregue' },
  { chave: 'chave_reserva', label: 'Chave reserva' },
  { chave: 'retrovisores', label: 'Retrovisores' },
  { chave: 'setas', label: 'Setas' },
  { chave: 'farol', label: 'Farol' },
  { chave: 'lanterna', label: 'Lanterna' },
  { chave: 'freios', label: 'Freios' },
  { chave: 'pneus', label: 'Pneus' },
  { chave: 'arranhoes_observados', label: 'Arranhões observados' },
]

export function calcularValorTotalOS(
  valorPecas: number,
  valorMaoObra: number,
  desconto: number,
  valorAdicional = 0
): number {
  return Math.max(0, valorPecas + valorMaoObra + valorAdicional - desconto)
}

export function getLabelFormaPagamento(forma: FormaPagamento | string): string {
  if (forma === 'credito_parcelado') return 'Cartão de crédito'
  return FORMAS_PAGAMENTO.find((f) => f.value === forma)?.label ?? forma
}

export function getLabelStatusOS(status: StatusOS): string {
  return STATUS_OS.find((s) => s.value === status)?.label ?? status
}

export function getLabelStatusAgendamento(status: StatusAgendamento): string {
  return STATUS_AGENDAMENTO.find((s) => s.value === status)?.label ?? status
}

export function getLabelStatusOrcamento(status: StatusOrcamento): string {
  return STATUS_ORCAMENTO.find((s) => s.value === status)?.label ?? status
}

export function getLabelStatusFinanceiroOS(status: StatusFinanceiroOS): string {
  return STATUS_FINANCEIRO_OS.find((s) => s.value === status)?.label ?? status
}
