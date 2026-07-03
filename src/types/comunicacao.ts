/** Tipos de mensagem pronta do Craft */
export type TipoMensagem =
  | 'moto_recebida'
  | 'orcamento_aguardando'
  | 'orcamento_aprovado'
  | 'moto_em_servico'
  | 'moto_aguardando_peca'
  | 'moto_finalizada'
  | 'moto_pronta_retirada'
  | 'lembrete_revisao'
  | 'garantia_vencimento'
  | 'envio_os'
  | 'envio_orcamento'

export type StatusContato = 'enviado_manualmente'

export interface ModeloMensagem {
  tipo: TipoMensagem
  label: string
  corpo: string
}

export interface HistoricoContato {
  id: string
  office_id: string
  data: string
  cliente_id: string
  cliente_nome: string
  tipo_mensagem: TipoMensagem
  ordem_servico_id?: string
  ordem_servico_numero?: number
  status: StatusContato
  preview: string
}

export interface VariaveisMensagem {
  nome_cliente: string
  moto: string
  placa: string
  status_os: string
  nome_oficina: string
  numero_os: string
  valor_os?: string
  data_garantia?: string
}

export const TIPOS_MENSAGEM: { value: TipoMensagem; label: string }[] = [
  { value: 'moto_recebida', label: 'Moto recebida na oficina' },
  { value: 'orcamento_aguardando', label: 'Orçamento aguardando aprovação' },
  { value: 'orcamento_aprovado', label: 'Orçamento aprovado' },
  { value: 'moto_em_servico', label: 'Moto em serviço' },
  { value: 'moto_aguardando_peca', label: 'Moto aguardando peça' },
  { value: 'moto_finalizada', label: 'Moto finalizada' },
  { value: 'moto_pronta_retirada', label: 'Moto pronta para retirada' },
  { value: 'lembrete_revisao', label: 'Lembrete de revisão' },
  { value: 'garantia_vencimento', label: 'Garantia próxima do vencimento' },
  { value: 'envio_os', label: 'Envio de OS via WhatsApp' },
  { value: 'envio_orcamento', label: 'Envio de orçamento via WhatsApp' },
]

export function getLabelTipoMensagem(tipo: TipoMensagem): string {
  return TIPOS_MENSAGEM.find((t) => t.value === tipo)?.label ?? tipo
}
