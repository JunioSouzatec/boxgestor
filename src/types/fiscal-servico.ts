/**
 * Dados fiscais do serviço do catálogo (F5A) — preparação para NFS-e futura.
 * Persistidos em servicos_catalogo.metadata.fiscal.
 * Sync multi-dispositivo via settings.metadata.servicos_catalogo (sem migration).
 * Não emite NFS-e. Não calcula ISS. Não integra prefeitura.
 */

export type OrigemDadosFiscaisServico = 'manual'

export type IssRetidoServico = '' | 'nao_informado' | 'nao' | 'sim'

export type ExigibilidadeIssServico =
  | ''
  | 'nao_informado'
  | 'exigivel'
  | 'nao_incidencia'
  | 'isencao'
  | 'imune'
  | 'suspensao'

export type StatusFiscalServico = 'incompleto' | 'basico' | 'pronto_conferencia'

export interface DadosFiscaisServico {
  descricao_fiscal?: string
  codigo_municipal_servico?: string
  item_lista_servico_lc116?: string
  codigo_tributacao_municipal?: string
  cnae?: string
  municipio_prestacao_padrao?: string
  /** Apenas informativo — não calcula imposto nesta fase. */
  aliquota_iss_informada?: number | null
  iss_retido?: IssRetidoServico
  exigibilidade_iss?: ExigibilidadeIssServico
  observacoes_fiscais?: string
  origem_dados?: OrigemDadosFiscaisServico
  atualizado_em?: string
  atualizado_por?: string
}

export interface MetadataServicoCatalogo {
  fiscal?: DadosFiscaisServico
  [chave: string]: unknown
}

export const ISS_RETIDO_OPCOES: { value: IssRetidoServico; label: string }[] = [
  { value: 'nao_informado', label: 'Não informado' },
  { value: 'nao', label: 'Não' },
  { value: 'sim', label: 'Sim' },
]

export const EXIGIBILIDADE_ISS_OPCOES: {
  value: ExigibilidadeIssServico
  label: string
}[] = [
  { value: 'nao_informado', label: 'Não informado' },
  { value: 'exigivel', label: 'Exigível' },
  { value: 'nao_incidencia', label: 'Não incidência' },
  { value: 'isencao', label: 'Isenção' },
  { value: 'imune', label: 'Imune' },
  { value: 'suspensao', label: 'Suspensão' },
]

export const DADOS_FISCAIS_SERVICO_VAZIO: DadosFiscaisServico = {
  descricao_fiscal: '',
  codigo_municipal_servico: '',
  item_lista_servico_lc116: '',
  codigo_tributacao_municipal: '',
  cnae: '',
  municipio_prestacao_padrao: '',
  aliquota_iss_informada: null,
  iss_retido: '',
  exigibilidade_iss: '',
  observacoes_fiscais: '',
  origem_dados: 'manual',
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function normalizarIssRetido(v: unknown): IssRetidoServico {
  const t = texto(v).trim().toLowerCase()
  if (t === 'sim' || t === 'nao' || t === 'não') return t === 'não' ? 'nao' : (t as IssRetidoServico)
  if (t === 'nao_informado' || t === 'não informado' || t === 'nao informado') return 'nao_informado'
  return ''
}

function normalizarExigibilidade(v: unknown): ExigibilidadeIssServico {
  const t = texto(v).trim().toLowerCase()
  const mapa: Record<string, ExigibilidadeIssServico> = {
    nao_informado: 'nao_informado',
    'não informado': 'nao_informado',
    'nao informado': 'nao_informado',
    exigivel: 'exigivel',
    exigível: 'exigivel',
    nao_incidencia: 'nao_incidencia',
    'nao incidencia': 'nao_incidencia',
    'não incidência': 'nao_incidencia',
    isencao: 'isencao',
    isenção: 'isencao',
    imune: 'imune',
    suspensao: 'suspensao',
    suspensão: 'suspensao',
  }
  return mapa[t] ?? ''
}

export function obterDadosFiscaisServico(
  servico?: {
    metadata?: MetadataServicoCatalogo | null
    nome?: string
    descricao?: string
  } | null
): DadosFiscaisServico {
  const raw = servico?.metadata?.fiscal
  if (!isRecord(raw)) {
    return {
      ...DADOS_FISCAIS_SERVICO_VAZIO,
      descricao_fiscal: '',
    }
  }
  const aliquotaRaw = raw.aliquota_iss_informada
  let aliquota: number | null = null
  if (aliquotaRaw != null && aliquotaRaw !== '') {
    const n = Number(aliquotaRaw)
    aliquota = Number.isFinite(n) ? n : null
  }
  return {
    ...DADOS_FISCAIS_SERVICO_VAZIO,
    descricao_fiscal: texto(raw.descricao_fiscal),
    codigo_municipal_servico: texto(raw.codigo_municipal_servico),
    item_lista_servico_lc116: texto(raw.item_lista_servico_lc116),
    codigo_tributacao_municipal: texto(raw.codigo_tributacao_municipal),
    cnae: texto(raw.cnae),
    municipio_prestacao_padrao: texto(raw.municipio_prestacao_padrao),
    aliquota_iss_informada: aliquota,
    iss_retido: normalizarIssRetido(raw.iss_retido),
    exigibilidade_iss: normalizarExigibilidade(raw.exigibilidade_iss),
    observacoes_fiscais: texto(raw.observacoes_fiscais),
    origem_dados: 'manual',
    atualizado_em: texto(raw.atualizado_em) || undefined,
    atualizado_por: texto(raw.atualizado_por) || undefined,
  }
}

export function descricaoFiscalServicoParaExibir(
  nome: string,
  descricaoFiscal?: string | null
): string | undefined {
  const df = String(descricaoFiscal ?? '').trim()
  if (!df) return undefined
  if (df.toLowerCase() === String(nome ?? '').trim().toLowerCase()) return undefined
  return df
}

export function descricaoFiscalServicoEfetiva(
  fiscal: DadosFiscaisServico,
  nome?: string,
  descricao?: string
): string {
  return (
    fiscal.descricao_fiscal?.trim() ||
    descricao?.trim() ||
    nome?.trim() ||
    ''
  )
}

/** Critério básico: código municipal + descrição/nome. */
export function cadastroFiscalServicoBasicoPreenchido(
  fiscal: DadosFiscaisServico,
  nomeServico?: string
): boolean {
  const codigoOk = Boolean(fiscal.codigo_municipal_servico?.trim())
  const descOk = Boolean(
    descricaoFiscalServicoEfetiva(fiscal, nomeServico).trim()
  )
  return codigoOk && descOk
}

/** Pronto para conferência: básico + LC 116 + município + exigibilidade. */
export function cadastroFiscalServicoProntoConferencia(
  fiscal: DadosFiscaisServico,
  nomeServico?: string
): boolean {
  if (!cadastroFiscalServicoBasicoPreenchido(fiscal, nomeServico)) return false
  const exig = fiscal.exigibilidade_iss
  const exigOk = Boolean(exig && exig !== 'nao_informado')
  return (
    Boolean(fiscal.item_lista_servico_lc116?.trim()) &&
    Boolean(fiscal.municipio_prestacao_padrao?.trim()) &&
    exigOk
  )
}

export function statusFiscalServico(
  fiscal: DadosFiscaisServico,
  nomeServico?: string
): StatusFiscalServico {
  if (cadastroFiscalServicoProntoConferencia(fiscal, nomeServico)) {
    return 'pronto_conferencia'
  }
  if (cadastroFiscalServicoBasicoPreenchido(fiscal, nomeServico)) {
    return 'basico'
  }
  return 'incompleto'
}

export function labelStatusFiscalServico(
  fiscal: DadosFiscaisServico,
  nomeServico?: string
): { status: StatusFiscalServico; label: string; badge: string } {
  const status = statusFiscalServico(fiscal, nomeServico)
  switch (status) {
    case 'pronto_conferencia':
      return {
        status,
        label: 'Pronto para conferência',
        badge: 'Fiscal conferido',
      }
    case 'basico':
      return { status, label: 'Básico', badge: 'Fiscal básico' }
    default:
      return { status, label: 'Incompleto', badge: 'Fiscal incompleto' }
  }
}

export function labelIssRetido(valor?: IssRetidoServico | null): string {
  if (!valor || valor === 'nao_informado') return 'Não informado'
  return ISS_RETIDO_OPCOES.find((o) => o.value === valor)?.label ?? '—'
}

export function labelExigibilidadeIss(
  valor?: ExigibilidadeIssServico | null
): string {
  if (!valor || valor === 'nao_informado') return 'Não informado'
  return EXIGIBILIDADE_ISS_OPCOES.find((o) => o.value === valor)?.label ?? '—'
}

export function normalizarDadosFiscaisServico(
  fiscal: DadosFiscaisServico
): DadosFiscaisServico {
  const aliquota =
    fiscal.aliquota_iss_informada == null ||
    Number.isNaN(Number(fiscal.aliquota_iss_informada))
      ? null
      : Math.round(Number(fiscal.aliquota_iss_informada) * 100) / 100

  const issRetido = normalizarIssRetido(fiscal.iss_retido)
  const exig = normalizarExigibilidade(fiscal.exigibilidade_iss)

  return {
    descricao_fiscal: fiscal.descricao_fiscal?.trim() || undefined,
    codigo_municipal_servico: fiscal.codigo_municipal_servico?.trim() || undefined,
    item_lista_servico_lc116: fiscal.item_lista_servico_lc116?.trim() || undefined,
    codigo_tributacao_municipal:
      fiscal.codigo_tributacao_municipal?.trim() || undefined,
    cnae: fiscal.cnae?.trim() || undefined,
    municipio_prestacao_padrao:
      fiscal.municipio_prestacao_padrao?.trim() || undefined,
    aliquota_iss_informada: aliquota,
    iss_retido: issRetido || undefined,
    exigibilidade_iss: exig || undefined,
    observacoes_fiscais: fiscal.observacoes_fiscais?.trim() || undefined,
    origem_dados: 'manual',
    atualizado_em: fiscal.atualizado_em ?? new Date().toISOString(),
    atualizado_por: fiscal.atualizado_por?.trim() || undefined,
  }
}

export function montarMetadataServicoComFiscal(
  metadataAtual: MetadataServicoCatalogo | undefined,
  fiscal: DadosFiscaisServico
): MetadataServicoCatalogo {
  return {
    ...(metadataAtual ?? {}),
    fiscal: normalizarDadosFiscaisServico(fiscal),
  }
}
