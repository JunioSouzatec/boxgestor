/**
 * Aprovação de Orçamento A1 — metadados internos (craft_meta).
 * Link público real fica bloqueado até tabela/token + RPC/Edge Function.
 */

export type CanalAprovacaoCliente =
  | 'manual'
  | 'telefone'
  | 'presencial'
  | 'whatsapp_texto'

/** Status exibido na UI interna (derivado + audit). */
export type StatusAprovacaoClienteUi =
  | 'nao_enviada'
  | 'enviada'
  | 'aguardando'
  | 'aprovado'
  | 'recusado'
  | 'convertido'

export interface EventoAprovacaoCliente {
  id: string
  tipo: 'enviado' | 'aprovado' | 'recusado' | 'observacao'
  em: string
  por_id?: string
  por_nome?: string
  cliente_nome?: string
  observacao?: string
  canal?: CanalAprovacaoCliente
}

export interface AprovacaoClienteMeta {
  /** Sempre bloqueado nesta fase A1. */
  link_publico: 'bloqueado_a1'
  canal_ultimo?: CanalAprovacaoCliente
  enviado_em?: string
  enviado_por_id?: string
  enviado_por_nome?: string
  respondido_em?: string
  cliente_nome?: string
  cliente_observacao?: string
  motivo_recusa?: string
  registrado_por_id?: string
  registrado_por_nome?: string
  eventos?: EventoAprovacaoCliente[]
}
