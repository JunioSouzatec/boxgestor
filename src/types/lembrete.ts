export type StatusLembrete = 'pendente' | 'proximo' | 'vencido' | 'contatado' | 'cancelado'

export type CategoriaRegraLembrete =
  | 'lubrificacao'
  | 'revisao'
  | 'freios'
  | 'transmissao'
  | 'pneus'
  | 'eletrica'
  | 'geral'

export const CATEGORIAS_REGRA: { value: CategoriaRegraLembrete; label: string }[] = [
  { value: 'lubrificacao', label: 'Lubrificação' },
  { value: 'revisao', label: 'Revisão' },
  { value: 'freios', label: 'Freios' },
  { value: 'transmissao', label: 'Transmissão' },
  { value: 'pneus', label: 'Pneus' },
  { value: 'eletrica', label: 'Elétrica' },
  { value: 'geral', label: 'Geral' },
]

export function getLabelCategoriaRegra(categoria: string): string {
  return CATEGORIAS_REGRA.find((c) => c.value === categoria)?.label ?? categoria
}

export interface RegraLembrete {
  id: string
  office_id: string
  nome_regra: string
  servico_relacionado: string
  categoria: CategoriaRegraLembrete | string
  prazo_dias: number
  prazo_meses: number
  km_retorno?: number
  mensagem_padrao: string
  observacoes_internas?: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export type RegraLembreteInput = Omit<
  RegraLembrete,
  'id' | 'office_id' | 'created_at' | 'updated_at'
>

export interface HistoricoContatoLembrete {
  data: string
  tipo: 'whatsapp_manual'
  servico: string
  observacao?: string
}

export interface LembreteCliente {
  id: string
  office_id: string
  cliente_id: string
  moto_id: string
  ordem_servico_id?: string
  ordem_servico_numero?: number
  regra_id?: string
  servico: string
  data_prevista: string
  km_prevista?: number
  km_base?: number
  mensagem: string
  observacoes?: string
  personalizado?: boolean
  /** Persistido para contatado/cancelado; demais são calculados pela data */
  status_fixo?: 'contatado' | 'cancelado'
  created_at: string
  contato?: HistoricoContatoLembrete
}

export type LembreteClienteInput = Omit<
  LembreteCliente,
  'id' | 'office_id' | 'created_at' | 'contato' | 'status_fixo'
>

export interface LembreteComStatus extends LembreteCliente {
  status: StatusLembrete
}

export interface LembreteRegraOverride {
  regra_id: string
  servico?: string
  data_prevista?: string
  km_prevista?: number
  mensagem?: string
  observacoes?: string
}

export interface LembretePersonalizadoInput {
  servico: string
  data_prevista: string
  km_prevista?: number
  mensagem: string
  observacoes?: string
}

export interface AtualizarLembreteInput {
  servico?: string
  data_prevista?: string
  km_prevista?: number
  mensagem?: string
  observacoes?: string
  status?: StatusLembrete
}

export interface ResumoLembretes {
  vencidos: LembreteComStatus[]
  proximos7Dias: LembreteComStatus[]
  contatarHoje: LembreteComStatus[]
  totalPendentes: number
}

export const STATUS_LEMBRETE: { value: StatusLembrete; label: string }[] = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'proximo', label: 'Próximo' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'contatado', label: 'Contatado' },
  { value: 'cancelado', label: 'Cancelado' },
]

export function getLabelStatusLembrete(status: StatusLembrete): string {
  return STATUS_LEMBRETE.find((s) => s.value === status)?.label ?? status
}
