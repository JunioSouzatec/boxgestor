/**
 * Dados fiscais do produto/peça (F3A) — preparação para NFC-e/NF-e.
 * Persistidos em inventory_items.metadata.fiscal (sem migration).
 * Não calcula imposto. Não emite nota.
 */
export type OrigemDadosFiscaisProduto = 'manual' | 'xml' | 'importado'

export type UnidadeFiscalProduto =
  | 'UN'
  | 'PC'
  | 'KG'
  | 'LT'
  | 'MT'
  | 'CX'
  | 'PAR'
  | 'JG'

export const UNIDADES_FISCAIS_PRODUTO: { value: UnidadeFiscalProduto; label: string }[] = [
  { value: 'UN', label: 'UN — Unidade' },
  { value: 'PC', label: 'PC — Peça' },
  { value: 'KG', label: 'KG — Quilograma' },
  { value: 'LT', label: 'LT — Litro' },
  { value: 'MT', label: 'MT — Metro' },
  { value: 'CX', label: 'CX — Caixa' },
  { value: 'PAR', label: 'PAR — Par' },
  { value: 'JG', label: 'JG — Jogo' },
]

export const ORIGENS_MERCADORIA: { value: string; label: string }[] = [
  { value: '0', label: '0 — Nacional' },
  { value: '1', label: '1 — Estrangeira (importação direta)' },
  { value: '2', label: '2 — Estrangeira (adquirida no mercado interno)' },
  { value: '3', label: '3 — Nacional, conteúdo importado > 40%' },
  { value: '4', label: '4 — Nacional (processos produtivos básicos)' },
  { value: '5', label: '5 — Nacional, conteúdo importado ≤ 40%' },
  { value: '6', label: '6 — Estrangeira importação direta, sem similar nacional' },
  { value: '7', label: '7 — Estrangeira mercado interno, sem similar nacional' },
  { value: '8', label: '8 — Nacional, conteúdo importado > 70%' },
]

export interface SugestaoFiscalXml {
  ncm?: string
  cfop?: string
  cest?: string
  ean?: string
  unidade?: string
  descricao?: string
  atualizado_em?: string
}

export interface DadosFiscaisProduto {
  ncm?: string
  cfop_padrao_venda?: string
  cfop_xml_entrada?: string
  cest?: string
  unidade_fiscal?: string
  origem_mercadoria?: string
  cst_csosn?: string
  aliquota_icms?: number | null
  ean?: string
  descricao_fiscal?: string
  observacoes_fiscais?: string
  tributavel?: boolean
  usar_dados_xml?: boolean
  origem_dados?: OrigemDadosFiscaisProduto
  atualizado_em?: string
  sugestao_xml?: SugestaoFiscalXml
}

export const DADOS_FISCAIS_PRODUTO_VAZIO: DadosFiscaisProduto = {
  ncm: '',
  cfop_padrao_venda: '',
  cfop_xml_entrada: '',
  cest: '',
  unidade_fiscal: '',
  origem_mercadoria: '',
  cst_csosn: '',
  aliquota_icms: null,
  ean: '',
  descricao_fiscal: '',
  observacoes_fiscais: '',
  tributavel: true,
  usar_dados_xml: true,
  origem_dados: 'manual',
}

export interface MetadataPeca {
  fornecedor_id_local?: string
  fiscal?: DadosFiscaisProduto
  [chave: string]: unknown
}

export function somenteDigitosFiscal(valor?: string | null): string {
  return (valor ?? '').replace(/\D/g, '')
}

export function normalizarNcm(valor?: string | null): string {
  return somenteDigitosFiscal(valor).slice(0, 8)
}

export function normalizarCest(valor?: string | null): string {
  return somenteDigitosFiscal(valor).slice(0, 7)
}

export function normalizarUnidadeFiscal(valor?: string | null): string {
  const t = (valor ?? '').trim().toUpperCase()
  if (!t) return ''
  const mapa: Record<string, UnidadeFiscalProduto> = {
    UN: 'UN',
    UND: 'UN',
    UNID: 'UN',
    UNIDADE: 'UN',
    PC: 'PC',
    PÇ: 'PC',
    PECA: 'PC',
    PEÇA: 'PC',
    KG: 'KG',
    KGS: 'KG',
    LT: 'LT',
    L: 'LT',
    LITRO: 'LT',
    MT: 'MT',
    M: 'MT',
    METRO: 'MT',
    CX: 'CX',
    CAIXA: 'CX',
    PAR: 'PAR',
    JG: 'JG',
    JOGO: 'JG',
  }
  return mapa[t] ?? t.slice(0, 6)
}

export function obterDadosFiscaisProduto(
  peca?: { metadata?: MetadataPeca | null; nome?: string; codigo_barras?: string; unidade?: string } | null
): DadosFiscaisProduto {
  const raw = peca?.metadata?.fiscal
  if (!raw || typeof raw !== 'object') {
    return {
      ...DADOS_FISCAIS_PRODUTO_VAZIO,
      ean: peca?.codigo_barras ?? '',
      descricao_fiscal: peca?.nome ?? '',
      // Unidade só pré-preenche se já existir na peça; origem fica vazia (não assume nacional).
      unidade_fiscal: normalizarUnidadeFiscal(peca?.unidade) || '',
      origem_mercadoria: '',
    }
  }
  const f = raw as DadosFiscaisProduto
  return {
    ...DADOS_FISCAIS_PRODUTO_VAZIO,
    ...f,
    ncm: f.ncm ?? '',
    cfop_padrao_venda: f.cfop_padrao_venda ?? '',
    cfop_xml_entrada: f.cfop_xml_entrada ?? '',
    cest: f.cest ?? '',
    unidade_fiscal: f.unidade_fiscal || normalizarUnidadeFiscal(peca?.unidade) || '',
    // Não forçar "0 — Nacional" quando ausente.
    origem_mercadoria: f.origem_mercadoria ?? '',
    cst_csosn: f.cst_csosn ?? '',
    aliquota_icms: f.aliquota_icms ?? null,
    ean: f.ean || peca?.codigo_barras || '',
    descricao_fiscal: f.descricao_fiscal || peca?.nome || '',
    observacoes_fiscais: f.observacoes_fiscais ?? '',
    tributavel: f.tributavel !== false,
    usar_dados_xml: f.usar_dados_xml !== false,
    origem_dados: f.origem_dados ?? 'manual',
  }
}

/** Critério F3A: NCM, unidade fiscal, origem e descrição (ou nome). */
export function cadastroFiscalProdutoBasicoPreenchido(
  fiscal: DadosFiscaisProduto,
  nomeProduto?: string
): boolean {
  const ncmOk = normalizarNcm(fiscal.ncm).length === 8
  const unidadeOk = Boolean(fiscal.unidade_fiscal?.trim())
  const origemOk = Boolean(fiscal.origem_mercadoria?.trim())
  const descOk = Boolean(
    fiscal.descricao_fiscal?.trim() || nomeProduto?.trim()
  )
  return ncmOk && unidadeOk && origemOk && descOk
}

export function labelStatusFiscalProduto(
  fiscal: DadosFiscaisProduto,
  nomeProduto?: string
): { completo: boolean; label: string } {
  const completo = cadastroFiscalProdutoBasicoPreenchido(fiscal, nomeProduto)
  return {
    completo,
    label: completo ? 'Fiscal básico preenchido' : 'Fiscal incompleto',
  }
}

export function normalizarDadosFiscaisProduto(fiscal: DadosFiscaisProduto): DadosFiscaisProduto {
  const ncm = normalizarNcm(fiscal.ncm)
  const cest = normalizarCest(fiscal.cest)
  const aliquota =
    fiscal.aliquota_icms == null || Number.isNaN(Number(fiscal.aliquota_icms))
      ? null
      : Math.round(Number(fiscal.aliquota_icms) * 100) / 100

  return {
    ...fiscal,
    ncm: ncm || undefined,
    cfop_padrao_venda: fiscal.cfop_padrao_venda?.replace(/\D/g, '').slice(0, 4) || undefined,
    cfop_xml_entrada: fiscal.cfop_xml_entrada?.replace(/\D/g, '').slice(0, 4) || undefined,
    cest: cest || undefined,
    unidade_fiscal: normalizarUnidadeFiscal(fiscal.unidade_fiscal) || undefined,
    origem_mercadoria: fiscal.origem_mercadoria?.trim() || undefined,
    cst_csosn: fiscal.cst_csosn?.trim() || undefined,
    aliquota_icms: aliquota,
    ean: somenteDigitosFiscal(fiscal.ean) || undefined,
    descricao_fiscal: fiscal.descricao_fiscal?.trim() || undefined,
    observacoes_fiscais: fiscal.observacoes_fiscais?.trim() || undefined,
    tributavel: fiscal.tributavel !== false,
    usar_dados_xml: fiscal.usar_dados_xml !== false,
    origem_dados: fiscal.origem_dados ?? 'manual',
    atualizado_em: fiscal.atualizado_em ?? new Date().toISOString(),
  }
}

export function validarDadosFiscaisProdutoLeve(fiscal: DadosFiscaisProduto): string | null {
  const ncm = normalizarNcm(fiscal.ncm)
  if (ncm && ncm.length !== 8) return 'NCM deve ter 8 dígitos.'
  const cest = normalizarCest(fiscal.cest)
  if (cest && cest.length < 5) return 'CEST inválido (use apenas números).'
  const cfop = (fiscal.cfop_padrao_venda ?? '').replace(/\D/g, '')
  if (cfop && cfop.length !== 4) return 'CFOP padrão de venda deve ter 4 dígitos.'
  return null
}

/**
 * Merge XML → fiscal existente.
 * Campos vazios recebem XML; campos manuais preenchidos são preservados;
 * divergências ficam em sugestao_xml.
 */
export function mesclarFiscalProdutoComXml(
  atual: DadosFiscaisProduto | undefined,
  xml: {
    ncm?: string
    cfop?: string
    cest?: string
    ean?: string
    unidade?: string
    descricao?: string
  }
): DadosFiscaisProduto {
  const base = { ...DADOS_FISCAIS_PRODUTO_VAZIO, ...(atual ?? {}) }
  const agora = new Date().toISOString()
  const sugestao: SugestaoFiscalXml = { ...(base.sugestao_xml ?? {}), atualizado_em: agora }

  function aplicar(
    campo: keyof DadosFiscaisProduto,
    valorXml?: string,
    chaveSugestao?: keyof SugestaoFiscalXml
  ) {
    const v = (valorXml ?? '').trim()
    if (!v) return
    const atualCampo = String(base[campo] ?? '').trim()
    if (!atualCampo) {
      ;(base as Record<string, unknown>)[campo] = v
      return
    }
    if (atualCampo !== v && chaveSugestao) {
      ;(sugestao as Record<string, unknown>)[chaveSugestao] = v
    }
  }

  aplicar('ncm', normalizarNcm(xml.ncm) || undefined, 'ncm')
  aplicar('cfop_xml_entrada', xml.cfop?.replace(/\D/g, '').slice(0, 4), 'cfop')
  aplicar('cest', normalizarCest(xml.cest) || undefined, 'cest')
  aplicar('ean', somenteDigitosFiscal(xml.ean) || undefined, 'ean')
  aplicar('unidade_fiscal', normalizarUnidadeFiscal(xml.unidade) || undefined, 'unidade')
  aplicar('descricao_fiscal', xml.descricao?.trim(), 'descricao')

  const temSugestao = Object.keys(sugestao).some(
    (k) => k !== 'atualizado_em' && Boolean((sugestao as Record<string, unknown>)[k])
  )

  return normalizarDadosFiscaisProduto({
    ...base,
    usar_dados_xml: true,
    origem_dados: base.origem_dados === 'manual' && Boolean(atual?.ncm) ? 'manual' : 'xml',
    atualizado_em: agora,
    sugestao_xml: temSugestao ? sugestao : base.sugestao_xml,
  })
}

export function montarMetadataPecaComFiscal(
  metadataAtual: MetadataPeca | undefined,
  fiscal: DadosFiscaisProduto,
  fornecedorIdLocal?: string
): MetadataPeca {
  return {
    ...(metadataAtual ?? {}),
    fornecedor_id_local: fornecedorIdLocal ?? metadataAtual?.fornecedor_id_local,
    fiscal: normalizarDadosFiscaisProduto(fiscal),
  }
}
