export type FormaPagamento =
  | 'pix'
  | 'dinheiro'
  | 'debito'
  | 'credito'
  | 'credito_parcelado'
  | 'fiado'

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

export type StatusOrcamento = 'aguardando_aprovacao' | 'aprovado' | 'reprovado'

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
