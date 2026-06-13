import type { BaseEntity } from '@/types/base'

export interface PreferenciasSistema {
  tema_escuro: boolean
  notificacoes: boolean
  alerta_estoque_baixo: boolean
}

/** Configuração da oficina — mapeia para tabela `offices` no Supabase */
export interface Oficina extends BaseEntity {
  office_id: string
  /** @deprecated usar office_id */
  oficina_id: string
  nome: string
  /** Nome fantasia exibido em documentos */
  nome_fantasia?: string
  /** Logradouro e número */
  endereco: string
  bairro?: string
  cidade?: string
  estado?: string
  cep?: string
  telefone: string
  whatsapp?: string
  cnpj?: string
  email?: string
  /** Logo em base64 (localStorage) — futuro: Supabase Storage via logo_storage_path */
  logo_url?: string
  logo_storage_path?: string
  preferencias: PreferenciasSistema
  created_at?: string
  updated_at?: string
}

/** Alias legado usado pelo app */
export type ConfiguracaoOficina = Oficina
