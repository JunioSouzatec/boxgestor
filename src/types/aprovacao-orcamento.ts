/**
 * Aprovação de Orçamento A1 — metadados internos (craft_meta).
 * Link público real fica bloqueado até tabela/token + RPC/Edge Function.
 */

export type CanalAprovacaoCliente =
  | 'manual'
  | 'telefone'
  | 'presencial'
  | 'whatsapp_texto'
  | 'link_publico'

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
  tipo: 'enviado' | 'aprovado' | 'recusado' | 'observacao' | 'link_gerado'
  em: string
  por_id?: string
  por_nome?: string
  cliente_nome?: string
  observacao?: string
  canal?: CanalAprovacaoCliente
}

export interface AprovacaoClienteMeta {
  /**
   * A1/A2.1: bloqueado até migration + Edge Functions autorizadas.
   * Edge create grava `true` (sem token). Strings legadas A1/A2.
   */
  link_publico?: boolean | 'bloqueado_a1' | 'bloqueado_a2_pendente' | 'ativo'
  /** Estado leve do link (ex.: aguardando_cliente) — sem token. */
  status?: string
  link_id?: string
  gerado_em?: string
  expira_em?: string
  gerado_por?: string
  gerado_por_id?: string
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
