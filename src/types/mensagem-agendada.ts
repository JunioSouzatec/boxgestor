import type { TipoMensagem } from '@/types/comunicacao'

export type StatusMensagemAgendadaArmazenado = 'pendente' | 'enviada' | 'cancelada'

export type StatusMensagemAgendadaExibicao = StatusMensagemAgendadaArmazenado | 'atrasada'

export type OrigemMensagemAgendada = 'manual' | 'os' | 'orcamento' | 'revisao'

export type FiltroMensagensAgendadas =
  | 'hoje'
  | 'atrasadas'
  | 'proximas'
  | 'enviadas'
  | 'canceladas'
  | 'todas'

export interface MensagemAgendada {
  id: string
  office_id: string
  agendado_para: string
  status: StatusMensagemAgendadaArmazenado
  cliente_id: string
  cliente_nome: string
  telefone: string
  moto_id?: string
  veiculo_descricao?: string
  placa?: string
  tipo_mensagem: TipoMensagem
  mensagem: string
  observacao_interna?: string
  ordem_servico_id?: string
  ordem_servico_numero?: number
  origem: OrigemMensagemAgendada
  responsavel_id?: string
  responsavel_nome?: string
  tipo_revisao?: string
  enviado_em?: string
  created_at: string
}

export interface MensagemAgendadaComStatus extends MensagemAgendada {
  status_exibicao: StatusMensagemAgendadaExibicao
}

export interface ResumoMensagensAgendadas {
  paraHoje: MensagemAgendadaComStatus[]
  atrasadas: MensagemAgendadaComStatus[]
  proximas: MensagemAgendadaComStatus[]
  enviadas: MensagemAgendadaComStatus[]
  canceladas: MensagemAgendadaComStatus[]
  totalPendentesHoje: number
  totalAtrasadas: number
}

export interface CriarMensagemAgendadaInput {
  agendado_para: string
  cliente_id: string
  cliente_nome: string
  telefone: string
  moto_id?: string
  veiculo_descricao?: string
  placa?: string
  tipo_mensagem: TipoMensagem
  mensagem: string
  observacao_interna?: string
  ordem_servico_id?: string
  ordem_servico_numero?: number
  origem: OrigemMensagemAgendada
  responsavel_id?: string
  responsavel_nome?: string
  tipo_revisao?: string
}

export const FILTROS_MENSAGENS_AGENDADAS: { value: FiltroMensagensAgendadas; label: string }[] = [
  { value: 'hoje', label: 'Para hoje' },
  { value: 'atrasadas', label: 'Atrasadas' },
  { value: 'proximas', label: 'Próximas' },
  { value: 'enviadas', label: 'Enviadas' },
  { value: 'canceladas', label: 'Canceladas' },
  { value: 'todas', label: 'Todas' },
]

export function getLabelOrigemMensagemAgendada(origem: OrigemMensagemAgendada): string {
  switch (origem) {
    case 'manual':
      return 'Manual'
    case 'os':
      return 'OS'
    case 'orcamento':
      return 'Orçamento'
    case 'revisao':
      return 'Revisão'
    default:
      return origem
  }
}

export function getLabelStatusMensagemAgendada(status: StatusMensagemAgendadaExibicao): string {
  switch (status) {
    case 'pendente':
      return 'Pendente'
    case 'atrasada':
      return 'Atrasada'
    case 'enviada':
      return 'Enviada'
    case 'cancelada':
      return 'Cancelada'
    default:
      return status
  }
}
