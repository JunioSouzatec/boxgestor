export type TipoEventoHistoricoOS =
  | 'criacao'
  | 'alteracao_valor'
  | 'conversao_orcamento'
  | 'os_de_orcamento'
  | 'registro_pagamento'

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
