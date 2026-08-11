/**
 * F6B — Tipos internos Focus NFe (sem emissão, sem API).
 */

import type { FiscalValidacaoTecnicaResultado } from '../fiscal-provider.types'

export type FocusDocumentoInterno =
  | 'nfe_futura'
  | 'nfce_futura'
  | 'nfse_futura'
  | 'mista_futura'

export type FocusOrigemReferencia =
  | `counter-sale:${string}`
  | `service-order:${string}`
  | `fiscal-draft:${string}`
  | string

export interface FocusEmitentePayload {
  cnpj?: string
  razao_social?: string
  nome_fantasia?: string
  inscricao_estadual?: string
  inscricao_municipal?: string
  regime_tributario?: string
  email?: string
  telefone?: string
  endereco?: {
    logradouro?: string
    numero?: string
    complemento?: string
    bairro?: string
    cidade?: string
    uf?: string
    cep?: string
    codigo_municipio_ibge?: string
  }
}

export interface FocusDestinatarioPayload {
  nome?: string
  cpf?: string
  cnpj?: string
  consumidor_nao_identificado: boolean
  endereco?: {
    logradouro?: string
    numero?: string
    bairro?: string
    cidade?: string
    uf?: string
    cep?: string
  }
}

export interface FocusItemProdutoPayload {
  referencia: string
  descricao: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  ncm?: string
  cfop?: string
  origem?: string
  cst_csosn?: string
  unidade?: string
  cest?: string
  ean?: string
}

export interface FocusItemServicoPayload {
  referencia: string
  descricao: string
  valor: number
  quantidade?: number
  codigo_municipal?: string
  item_lc116?: string
  codigo_tributacao_municipal?: string
  municipio_prestacao?: string
  exigibilidade_iss?: string
  /** Informativo — não é cálculo de imposto. */
  aliquota_iss_informada?: number | null
}

export interface FocusPagamentoPayload {
  forma?: string
  status_label?: string
  pagamento_pendente: boolean
  valor_total: number
  desconto?: number
}

export interface FocusPayloadTecnico {
  /** Identificador interno — não é chave fiscal. */
  schema: 'boxgestor.focus.payload.v1'
  provedor: 'focus_nfe'
  emissao_status: 'desativada'
  chamada_externa: 'desativada'
  ambiente_desejado: 'homologacao' | 'producao'
  tipo_documento_interno: FocusDocumentoInterno
  tipo_documento_label: string
  origem: 'venda_balcao' | 'ordem_servico'
  referencia_interna: FocusOrigemReferencia
  origem_label: string
  gerado_em: string
  documentos_separados_sugeridos: boolean
  avisos_documento: string[]
  emitente: FocusEmitentePayload
  destinatario: FocusDestinatarioPayload
  produtos: FocusItemProdutoPayload[]
  servicos: FocusItemServicoPayload[]
  pagamento: FocusPagamentoPayload
  totais: {
    produtos: number
    servicos: number
    geral: number
  }
  series_informativas?: {
    nfe_serie?: string
    nfce_serie?: string
    nfse_serie?: string
  }
  /** Metadados seguros — sem token/certificado. */
  meta: {
    token_configurado: boolean
    certificado_status: string
    empresa_id_informado: boolean
    tipos_documento_desejados: string[]
  }
}

export interface FocusPreviaTecnica {
  provedor: 'Focus NFe'
  ambiente_desejado: string
  tipo_interno: string
  status_emissao: 'Emissão desativada'
  chamada_externa: 'Desativada nesta fase'
  pronto_tecnicamente: boolean
  validacao: FiscalValidacaoTecnicaResultado
  payload_sanitizado: unknown
  avisos: string[]
}
