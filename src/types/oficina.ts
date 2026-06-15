import type { BaseEntity } from '@/types/base'

export interface PreferenciasSistema {
  tema_escuro: boolean
  notificacoes: boolean
  alerta_estoque_baixo: boolean
  /** Exibir número da OS em destaque na listagem */
  os_destaque_numero?: boolean
  /** Sugerir impressão de recibo ao finalizar OS */
  os_sugerir_recibo?: boolean
  /** Oficina criada pelo cadastro público — não mesclar com seed demo */
  cadastro_limpo?: boolean
  /** simples = menos campos na OS; completa = todos os recursos */
  os_modo?: 'simples' | 'completa'
}

/** Cores personalizáveis da marca da oficina */
export interface CoresMarcaOficina {
  cor_primaria?: string
  cor_secundaria?: string
  cor_destaque?: string
  cor_botoes?: string
  cor_sucesso?: string
  cor_alerta?: string
  cor_erro?: string
}

/** Aparência visual — logo, nome exibido e cores */
export interface AparienciaOficina {
  /** Nome exibido no menu, login e cabeçalho */
  nome_exibido?: string
  cores?: CoresMarcaOficina
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
  /** Horário de funcionamento exibido em documentos e portal */
  horario_funcionamento?: string
  /** Logo em base64 (localStorage) — futuro: Supabase Storage via logo_storage_path */
  logo_url?: string
  logo_storage_path?: string
  /** Quando preenchido, a logo foi removida explicitamente — não restaurar de cache/remoto */
  logo_removida_em?: string
  /** Personalização visual (cores, nome exibido) */
  aparencia?: AparienciaOficina
  preferencias: PreferenciasSistema
  created_at?: string
  updated_at?: string
}

/** Alias legado usado pelo app */
export type ConfiguracaoOficina = Oficina
