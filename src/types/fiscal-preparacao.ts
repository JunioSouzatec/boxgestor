/**
 * F4A — Preparação / validação fiscal (sem emissão).
 * Rascunho em memória a partir de OS ou Venda Balcão.
 */
export type OrigemPreparacaoFiscal = 'venda_balcao' | 'ordem_servico'

/** Status orientativos — nunca Emitida/Autorizada nesta fase. */
export type StatusPreparacaoFiscal =
  | 'pronta_para_preparar'
  | 'com_pendencias'
  | 'nao_preparada'

export type SeveridadePendenciaFiscal = 'bloqueante' | 'aviso'

export type EscopoPendenciaFiscal =
  | 'oficina'
  | 'cliente'
  | 'produto'
  | 'servico'
  | 'venda'
  | 'pagamento'
  | 'geral'

export interface PendenciaFiscalItem {
  id: string
  escopo: EscopoPendenciaFiscal
  severidade: SeveridadePendenciaFiscal
  mensagem: string
  referencia?: string
}

export type TipoDocumentoFiscalSugerido =
  | 'nfc_e_nf_e'
  | 'nfs_e'
  | 'misto_servico_produto'

export interface ItemProdutoPreparacao {
  chave: string
  nome: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  peca_id?: string
  descricao_fiscal?: string
  ncm?: string
  unidade_fiscal?: string
  origem_mercadoria?: string
  ean?: string
  cfop_padrao_venda?: string
  cst_csosn?: string
  fiscal_basico_ok: boolean
}

export interface ItemServicoPreparacao {
  chave: string
  nome: string
  valor: number
  descricao?: string
  /** Sempre pendente nesta fase — código municipal ainda não cadastrado. */
  codigo_servico_municipal_pendente: boolean
}

export interface PreparacaoNotaFiscal {
  origem: OrigemPreparacaoFiscal
  origem_id: string
  origem_label: string
  cliente_nome?: string
  cliente_id?: string
  consumidor_nao_identificado: boolean
  data?: string
  valor_total: number
  status_financeiro_label: string
  pagamento_pendente: boolean
  forma_pagamento?: string
  desconto?: number
  tipo_sugerido: TipoDocumentoFiscalSugerido
  tipo_sugerido_label: string
  status: StatusPreparacaoFiscal
  status_label: string
  produtos: ItemProdutoPreparacao[]
  servicos: ItemServicoPreparacao[]
  pendencias: PendenciaFiscalItem[]
  avisos: string[]
  oficina_ok: boolean
  cliente_ok: boolean
  produtos_ok: boolean
  servicos_ok: boolean
}

export interface ResumoFiscalCentral {
  oficina_completa: boolean
  clientes_basico_preenchido: number
  clientes_total: number
  produtos_basico_preenchido: number
  produtos_total: number
  pendencias_amostra: number
  emissao_ativa: false
}

export function labelStatusPreparacao(status: StatusPreparacaoFiscal): string {
  switch (status) {
    case 'pronta_para_preparar':
      return 'Pronta para preparar'
    case 'com_pendencias':
      return 'Com pendências'
    default:
      return 'Não preparada'
  }
}

export function labelTipoDocumentoSugerido(tipo: TipoDocumentoFiscalSugerido): string {
  switch (tipo) {
    case 'nfc_e_nf_e':
      return 'NFC-e / NF-e futura (produtos)'
    case 'nfs_e':
      return 'NFS-e futura (serviços)'
    case 'misto_servico_produto':
      return 'Serviço + Produto'
  }
}
