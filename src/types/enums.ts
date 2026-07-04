export type FormaPagamento =
  | 'pix'
  | 'dinheiro'
  | 'debito'
  | 'credito'
  | 'fiado'
  | 'transferencia'
  | 'outro'

export type StatusFinanceiroOS =
  | 'nao_pago'
  | 'parcialmente_pago'
  | 'pago'
  | 'pendente'
  | 'cancelado'

export type StatusOS =
  | 'recebida'
  | 'em_diagnostico'
  | 'aguardando_aprovacao'
  | 'aguardando_peca'
  | 'em_servico'
  | 'finalizada'
  | 'entregue'
  | 'cancelada'

export type StatusAgendamento =
  | 'agendado'
  | 'confirmado'
  | 'em_atendimento'
  | 'concluido'
  | 'cancelado'

export type TipoLancamento = 'receita' | 'despesa'

export type StatusOrcamento =
  | 'rascunho'
  | 'enviado'
  | 'aguardando_aprovacao'
  | 'aprovado'
  | 'recusado'
  | 'convertido'

export type ChaveItemChecklist =
  | 'combustivel'
  | 'capacete_entregue'
  | 'chave_reserva'
  | 'retrovisores'
  | 'setas'
  | 'farol'
  | 'lanterna'
  | 'freios'
  | 'pneus'
  | 'arranhoes_observados'
