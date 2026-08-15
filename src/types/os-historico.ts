export type TipoEventoHistoricoOS =
  | 'criacao'
  | 'alteracao_valor'
  | 'alteracao_status'
  | 'conversao_orcamento'
  | 'os_de_orcamento'
  | 'registro_pagamento'
  | 'atribuicao_responsavel'
  | 'envio_orcamento_cliente'
  | 'aprovacao_orcamento'
  | 'recusa_orcamento'
  | 'link_aprovacao_gerado'
  /** Envio manual WhatsApp (mensagem/PDF/fotos) — sem token/URL. */
  | 'comunicacao_whatsapp'

export interface EventoHistoricoOS {
  id: string
  tipo: TipoEventoHistoricoOS
  titulo: string
  data_hora: string
  usuario_id?: string
  usuario_nome?: string
  autorizado_pin?: boolean
  campo?: string
  valor_anterior?: number
  valor_novo?: number
  detalhe?: string
}
