/**
 * RC2 Fiscal F6A — configuração de provedor/homologação (sem emissão).
 * Persistido em settings.metadata.fiscal_config — sem migration.
 * Não chama API. Não armazena token/certificado real.
 */

export type StatusModuloFiscalConfig =
  | 'nao_configurado'
  | 'em_preparacao'
  | 'homologacao_futura'
  | 'producao_futura'

export type AmbienteFiscalDesejado = 'homologacao' | 'producao'

export type ProvedorFiscalNome =
  | 'nao_escolhido'
  | 'nuvem_fiscal'
  | 'focus_nfe'
  | 'plugnotas'
  | 'tecnospeed'
  | 'enotas'
  | 'outro'

export type StatusCertificadoA1Config =
  | 'nao'
  | 'sim_fora_boxgestor'
  | 'sera_no_provedor'

export interface TiposDocumentoFiscalConfig {
  nfe_produtos: boolean
  nfce_venda_balcao: boolean
  nfse_servicos: boolean
  os_mista_separada: boolean
}

export interface ProvedorFiscalConfig {
  nome: ProvedorFiscalNome
  outro_nome?: string
  empresa_id?: string
  /** true se o usuário marcou/informou placeholder de token — nunca o valor real. */
  token_configurado: boolean
  /** Máscara visual (ex.: ••••1234). Sem segredo. */
  token_mascarado?: string
  url_homologacao?: string
  url_producao?: string
  observacoes?: string
}

export interface CertificadoA1Config {
  status: StatusCertificadoA1Config
  validade?: string
  responsavel_renovacao?: string
  observacoes?: string
}

export interface SeriesFiscaisConfig {
  nfe_serie?: string
  nfce_serie?: string
  nfse_serie?: string
  nfe_proximo_numero?: string
  nfce_proximo_numero?: string
  nfse_proximo_numero?: string
}

export interface ResponsaveisFiscaisConfig {
  responsavel_oficina?: string
  contador_nome?: string
  contador_telefone?: string
  contador_email?: string
  observacoes?: string
}

export interface FiscalConfigOficina {
  status_modulo_fiscal: StatusModuloFiscalConfig
  ambiente_desejado: AmbienteFiscalDesejado
  tipos_documento: TiposDocumentoFiscalConfig
  provedor: ProvedorFiscalConfig
  certificado: CertificadoA1Config
  series: SeriesFiscaisConfig
  responsaveis: ResponsaveisFiscaisConfig
  atualizado_em?: string
  atualizado_por?: string
}

export const FISCAL_CONFIG_VAZIO: FiscalConfigOficina = {
  status_modulo_fiscal: 'nao_configurado',
  ambiente_desejado: 'homologacao',
  tipos_documento: {
    nfe_produtos: false,
    nfce_venda_balcao: false,
    nfse_servicos: false,
    os_mista_separada: false,
  },
  provedor: {
    nome: 'nao_escolhido',
    outro_nome: '',
    empresa_id: '',
    token_configurado: false,
    token_mascarado: '',
    url_homologacao: '',
    url_producao: '',
    observacoes: '',
  },
  certificado: {
    status: 'nao',
    validade: '',
    responsavel_renovacao: '',
    observacoes: '',
  },
  series: {
    nfe_serie: '',
    nfce_serie: '',
    nfse_serie: '',
    nfe_proximo_numero: '',
    nfce_proximo_numero: '',
    nfse_proximo_numero: '',
  },
  responsaveis: {
    responsavel_oficina: '',
    contador_nome: '',
    contador_telefone: '',
    contador_email: '',
    observacoes: '',
  },
}

export const STATUS_MODULO_FISCAL_OPCOES: Array<{
  value: StatusModuloFiscalConfig
  label: string
}> = [
  { value: 'nao_configurado', label: 'Não configurado' },
  { value: 'em_preparacao', label: 'Em preparação' },
  { value: 'homologacao_futura', label: 'Homologação futura' },
  { value: 'producao_futura', label: 'Produção futura' },
]

export const AMBIENTE_DESEJADO_OPCOES: Array<{
  value: AmbienteFiscalDesejado
  label: string
}> = [
  { value: 'homologacao', label: 'Homologação' },
  { value: 'producao', label: 'Produção' },
]

export const PROVEDOR_FISCAL_OPCOES: Array<{ value: ProvedorFiscalNome; label: string }> = [
  { value: 'nao_escolhido', label: 'Não escolhido' },
  { value: 'nuvem_fiscal', label: 'Nuvem Fiscal' },
  { value: 'focus_nfe', label: 'Focus NFe' },
  { value: 'plugnotas', label: 'PlugNotas' },
  { value: 'tecnospeed', label: 'TecnoSpeed' },
  { value: 'enotas', label: 'eNotas' },
  { value: 'outro', label: 'Outro' },
]

export const CERTIFICADO_A1_STATUS_OPCOES: Array<{
  value: StatusCertificadoA1Config
  label: string
}> = [
  { value: 'nao', label: 'Não' },
  { value: 'sim_fora_boxgestor', label: 'Sim, fora do BoxGestor' },
  { value: 'sera_no_provedor', label: 'Será configurado no provedor fiscal' },
]

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function asBool(v: unknown): boolean {
  return v === true
}

function asStatusModulo(v: unknown): StatusModuloFiscalConfig {
  const s = String(v ?? '')
  if (
    s === 'em_preparacao' ||
    s === 'homologacao_futura' ||
    s === 'producao_futura' ||
    s === 'nao_configurado'
  ) {
    return s
  }
  return 'nao_configurado'
}

function asAmbiente(v: unknown): AmbienteFiscalDesejado {
  return v === 'producao' ? 'producao' : 'homologacao'
}

function asProvedor(v: unknown): ProvedorFiscalNome {
  const s = String(v ?? '')
  if (
    s === 'nuvem_fiscal' ||
    s === 'focus_nfe' ||
    s === 'plugnotas' ||
    s === 'tecnospeed' ||
    s === 'enotas' ||
    s === 'outro' ||
    s === 'nao_escolhido'
  ) {
    return s
  }
  return 'nao_escolhido'
}

function asCertificado(v: unknown): StatusCertificadoA1Config {
  const s = String(v ?? '')
  if (s === 'sim_fora_boxgestor' || s === 'sera_no_provedor' || s === 'nao') return s
  return 'nao'
}

/** Gera máscara sem guardar o segredo (últimos 4 chars se houver). */
export function mascararTokenPlaceholder(valorDigitado: string): string {
  const limpo = String(valorDigitado ?? '').trim()
  if (!limpo) return ''
  if (limpo.length <= 4) return '••••'
  return `••••${limpo.slice(-4)}`
}

export function labelProvedorFiscal(nome: ProvedorFiscalNome, outroNome?: string): string {
  if (nome === 'outro') {
    const o = String(outroNome ?? '').trim()
    return o ? `Outro (${o})` : 'Outro'
  }
  return PROVEDOR_FISCAL_OPCOES.find((p) => p.value === nome)?.label ?? 'Não escolhido'
}

export function labelStatusModuloFiscal(s: StatusModuloFiscalConfig): string {
  return STATUS_MODULO_FISCAL_OPCOES.find((o) => o.value === s)?.label ?? 'Não configurado'
}

export function labelAmbienteDesejado(a: AmbienteFiscalDesejado): string {
  return a === 'producao' ? 'Produção' : 'Homologação'
}

export function labelCertificadoA1(s: StatusCertificadoA1Config): string {
  return CERTIFICADO_A1_STATUS_OPCOES.find((o) => o.value === s)?.label ?? 'Não'
}

export function provedorFoiEscolhido(cfg: FiscalConfigOficina): boolean {
  return cfg.provedor.nome !== 'nao_escolhido'
}

export function certificadoInformado(cfg: FiscalConfigOficina): boolean {
  return (
    cfg.certificado.status === 'sim_fora_boxgestor' ||
    cfg.certificado.status === 'sera_no_provedor'
  )
}

export function normalizarFiscalConfig(
  raw?: Partial<FiscalConfigOficina> | null | unknown
): FiscalConfigOficina {
  if (!isRecord(raw)) return { ...FISCAL_CONFIG_VAZIO, tipos_documento: { ...FISCAL_CONFIG_VAZIO.tipos_documento }, provedor: { ...FISCAL_CONFIG_VAZIO.provedor }, certificado: { ...FISCAL_CONFIG_VAZIO.certificado }, series: { ...FISCAL_CONFIG_VAZIO.series }, responsaveis: { ...FISCAL_CONFIG_VAZIO.responsaveis } }

  const tiposRaw = isRecord(raw.tipos_documento) ? raw.tipos_documento : {}
  const provRaw = isRecord(raw.provedor) ? raw.provedor : {}
  const certRaw = isRecord(raw.certificado) ? raw.certificado : {}
  const seriesRaw = isRecord(raw.series) ? raw.series : {}
  const respRaw = isRecord(raw.responsaveis) ? raw.responsaveis : {}

  return {
    status_modulo_fiscal: asStatusModulo(raw.status_modulo_fiscal),
    ambiente_desejado: asAmbiente(raw.ambiente_desejado),
    tipos_documento: {
      nfe_produtos: asBool(tiposRaw.nfe_produtos),
      nfce_venda_balcao: asBool(tiposRaw.nfce_venda_balcao),
      nfse_servicos: asBool(tiposRaw.nfse_servicos),
      os_mista_separada: asBool(tiposRaw.os_mista_separada),
    },
    provedor: {
      nome: asProvedor(provRaw.nome),
      outro_nome: asString(provRaw.outro_nome),
      empresa_id: asString(provRaw.empresa_id),
      // Nunca persistir valor bruto de token — só flags/máscara.
      token_configurado: asBool(provRaw.token_configurado),
      token_mascarado: asString(provRaw.token_mascarado).slice(0, 24),
      url_homologacao: asString(provRaw.url_homologacao).slice(0, 500),
      url_producao: asString(provRaw.url_producao).slice(0, 500),
      observacoes: asString(provRaw.observacoes).slice(0, 2000),
    },
    certificado: {
      status: asCertificado(certRaw.status),
      validade: asString(certRaw.validade).slice(0, 40),
      responsavel_renovacao: asString(certRaw.responsavel_renovacao).slice(0, 120),
      observacoes: asString(certRaw.observacoes).slice(0, 2000),
    },
    series: {
      nfe_serie: asString(seriesRaw.nfe_serie).slice(0, 20),
      nfce_serie: asString(seriesRaw.nfce_serie).slice(0, 20),
      nfse_serie: asString(seriesRaw.nfse_serie).slice(0, 20),
      nfe_proximo_numero: asString(seriesRaw.nfe_proximo_numero).slice(0, 20),
      nfce_proximo_numero: asString(seriesRaw.nfce_proximo_numero).slice(0, 20),
      nfse_proximo_numero: asString(seriesRaw.nfse_proximo_numero).slice(0, 20),
    },
    responsaveis: {
      responsavel_oficina: asString(respRaw.responsavel_oficina).slice(0, 120),
      contador_nome: asString(respRaw.contador_nome).slice(0, 120),
      contador_telefone: asString(respRaw.contador_telefone).slice(0, 40),
      contador_email: asString(respRaw.contador_email).slice(0, 160),
      observacoes: asString(respRaw.observacoes).slice(0, 2000),
    },
    atualizado_em: asString(raw.atualizado_em) || undefined,
    atualizado_por: asString(raw.atualizado_por) || undefined,
  }
}

export function obterFiscalConfig(
  configuracao?: { fiscal_config?: FiscalConfigOficina | null } | null | unknown
): FiscalConfigOficina {
  if (!isRecord(configuracao)) return normalizarFiscalConfig(null)
  return normalizarFiscalConfig(configuracao.fiscal_config)
}

/**
 * Monta payload seguro para salvar: remove qualquer token digitado.
 * Usa apenas token_configurado + token_mascarado.
 */
export function montarFiscalConfigParaSalvar(input: {
  form: FiscalConfigOficina
  tokenDigitado?: string
  atualizadoPor?: string
}): FiscalConfigOficina {
  const base = normalizarFiscalConfig(input.form)
  const digitado = String(input.tokenDigitado ?? '').trim()
  let token_configurado = base.provedor.token_configurado
  let token_mascarado = base.provedor.token_mascarado ?? ''

  if (digitado) {
    token_configurado = true
    token_mascarado = mascararTokenPlaceholder(digitado)
  }

  return normalizarFiscalConfig({
    ...base,
    provedor: {
      ...base.provedor,
      token_configurado,
      token_mascarado,
    },
    atualizado_em: new Date().toISOString(),
    atualizado_por: input.atualizadoPor?.trim() || base.atualizado_por,
  })
}
