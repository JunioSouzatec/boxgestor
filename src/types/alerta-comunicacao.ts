import type { TipoMensagem } from '@/types/comunicacao'

export type TipoAlertaComunicacao =
  | 'previsao_entrega'
  | 'retorno_retirada'
  | 'revisao'
  | 'agendamento'

export type StatusAlertaComunicacao = 'pendente' | 'enviado' | 'resolvido' | 'adiado'

export type PrioridadeAlertaComunicacao = 'vencido' | 'hoje' | 'proximos_dias'

export type FiltroAlertasComunicacao =
  | 'pendentes'
  | 'vencidos'
  | 'hoje'
  | 'proximos'
  | 'enviados'
  | 'resolvidos'
  | 'adiados'
  | 'todos'

export interface AlertaComunicacao {
  id: string
  office_id: string
  /** Chave estável para deduplicação (ex.: os-{id}-previsao_entrega) */
  local_id: string
  cliente_id: string
  cliente_nome: string
  telefone?: string
  moto_id?: string
  moto_descricao?: string
  placa?: string
  ordem_servico_id?: string
  ordem_servico_numero?: number
  lembrete_id?: string
  agendamento_id?: string
  tipo: TipoAlertaComunicacao
  motivo: string
  status: StatusAlertaComunicacao
  prioridade: PrioridadeAlertaComunicacao
  due_date: string
  message_text: string
  tipo_mensagem: TipoMensagem
  adiado_ate?: string
  created_at: string
  updated_at: string
  resolved_at?: string
}

export interface ResumoAlertasComunicacao {
  vencidos: number
  hoje: number
  proximos: number
  pendentes: number
  enviados: number
  resolvidos: number
  adiados: number
}

export const FILTROS_ALERTAS_COMUNICACAO: { value: FiltroAlertasComunicacao; label: string }[] = [
  { value: 'pendentes', label: 'Pendentes' },
  { value: 'vencidos', label: 'Vencidos' },
  { value: 'hoje', label: 'Hoje' },
  { value: 'proximos', label: 'Próximos dias' },
  { value: 'enviados', label: 'Enviados' },
  { value: 'resolvidos', label: 'Resolvidos' },
  { value: 'adiados', label: 'Adiados' },
  { value: 'todos', label: 'Todos' },
]

export function getLabelTipoAlertaComunicacao(tipo: TipoAlertaComunicacao): string {
  switch (tipo) {
    case 'previsao_entrega':
      return 'Previsão de entrega'
    case 'retorno_retirada':
      return 'Retorno / retirada'
    case 'revisao':
      return 'Revisão'
    case 'agendamento':
      return 'Agendamento'
    default:
      return tipo
  }
}

export function getLabelStatusAlertaComunicacao(status: StatusAlertaComunicacao): string {
  switch (status) {
    case 'pendente':
      return 'Pendente'
    case 'enviado':
      return 'Enviado'
    case 'resolvido':
      return 'Resolvido'
    case 'adiado':
      return 'Adiado'
    default:
      return status
  }
}

export type FiltroResumoAlerta = 'vencidos' | 'hoje' | 'proximos' | 'pendentes'

export function filtroResumoParaFiltroLista(filtro: FiltroResumoAlerta): FiltroAlertasComunicacao {
  switch (filtro) {
    case 'vencidos':
      return 'vencidos'
    case 'hoje':
      return 'hoje'
    case 'proximos':
      return 'proximos'
    case 'pendentes':
      return 'pendentes'
  }
}

export function getLabelPrioridadeAlerta(prioridade: PrioridadeAlertaComunicacao): string {
  switch (prioridade) {
    case 'vencido':
      return 'Vencido'
    case 'hoje':
      return 'Hoje'
    case 'proximos_dias':
      return 'Próximos dias'
    default:
      return prioridade
  }
}
