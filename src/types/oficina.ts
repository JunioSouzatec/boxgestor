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
  endereco: string
  telefone: string
  cnpj?: string
  email?: string
  preferencias: PreferenciasSistema
  created_at?: string
  updated_at?: string
}

/** Alias legado usado pelo app */
export type ConfiguracaoOficina = Oficina
