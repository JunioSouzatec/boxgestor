/**
 * RC2 Fiscal F2 — cadastro fiscal da oficina (sem emissão).
 * Persistido em settings.metadata.fiscal — sem migration.
 */

export type RegimeTributario =
  | 'simples_nacional'
  | 'simples_nacional_excesso'
  | 'regime_normal'
  | 'mei'

export type AmbienteFiscal = 'homologacao' | 'producao'

export type TipoDocumentoFiscalPretendido = 'nfc_e' | 'nf_e' | 'nfs_e'

export interface EnderecoFiscalOficina {
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  uf?: string
  codigo_municipio_ibge?: string
  pais?: string
}

export interface DadosFiscaisOficina {
  /** CNPJ só dígitos (14) quando válido; pode ficar parcial enquanto digita. */
  cnpj?: string
  razao_social?: string
  nome_fantasia?: string
  inscricao_estadual?: string
  inscricao_municipal?: string
  regime_tributario?: RegimeTributario | ''
  cnae_principal?: string
  email_fiscal?: string
  telefone_fiscal?: string
  endereco?: EnderecoFiscalOficina
  ambiente?: AmbienteFiscal
  tipos_documento_pretendidos?: TipoDocumentoFiscalPretendido[]
  /** ISO — última vez que o usuário salvou a seção Fiscal */
  atualizado_em?: string
}

export const REGIMES_TRIBUTARIOS: Array<{ value: RegimeTributario; label: string }> = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'simples_nacional_excesso', label: 'Simples Nacional — excesso de sublimite' },
  { value: 'regime_normal', label: 'Regime Normal' },
  { value: 'mei', label: 'MEI' },
]

export const AMBIENTES_FISCAIS: Array<{ value: AmbienteFiscal; label: string }> = [
  { value: 'homologacao', label: 'Homologação' },
  { value: 'producao', label: 'Produção' },
]

export const TIPOS_DOCUMENTO_FISCAL: Array<{
  value: TipoDocumentoFiscalPretendido
  label: string
  descricao: string
}> = [
  { value: 'nfc_e', label: 'NFC-e', descricao: 'Venda ao consumidor (balcão)' },
  { value: 'nf_e', label: 'NF-e', descricao: 'Nota fiscal eletrônica de produto' },
  { value: 'nfs_e', label: 'NFS-e', descricao: 'Nota de serviço (mão de obra)' },
]

export const DADOS_FISCAIS_OFICINA_VAZIO: DadosFiscaisOficina = {
  cnpj: '',
  razao_social: '',
  nome_fantasia: '',
  inscricao_estadual: '',
  inscricao_municipal: '',
  regime_tributario: '',
  cnae_principal: '',
  email_fiscal: '',
  telefone_fiscal: '',
  endereco: {
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    codigo_municipio_ibge: '',
    pais: 'Brasil',
  },
  ambiente: 'homologacao',
  tipos_documento_pretendidos: [],
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function somenteDigitos(valor: string | undefined | null): string {
  return String(valor ?? '').replace(/\D/g, '')
}

export function formatarCnpjExibicao(cnpj: string | undefined | null): string {
  const d = somenteDigitos(cnpj).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export function formatarCepExibicao(cep: string | undefined | null): string {
  const d = somenteDigitos(cep).slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

export function emailFiscalValido(email: string | undefined | null): boolean {
  const e = String(email ?? '').trim()
  if (!e) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

export function ufFiscalValida(uf: string | undefined | null): boolean {
  const u = String(uf ?? '').trim().toUpperCase()
  if (!u) return true
  return /^[A-Z]{2}$/.test(u)
}

const REGIMES = new Set<string>(REGIMES_TRIBUTARIOS.map((r) => r.value))
const AMBIENTES = new Set<string>(AMBIENTES_FISCAIS.map((a) => a.value))
const TIPOS_DOC = new Set<string>(TIPOS_DOCUMENTO_FISCAL.map((t) => t.value))

function textoLimpo(v: unknown): string {
  if (v == null) return ''
  const s = String(v).trim()
  if (!s || s === 'undefined' || s === 'null') return ''
  return s
}

function normalizarEndereco(raw: unknown): EnderecoFiscalOficina {
  const base = { ...DADOS_FISCAIS_OFICINA_VAZIO.endereco! }
  if (!isRecord(raw)) return base
  const uf = textoLimpo(raw.uf).toUpperCase().slice(0, 2)
  return {
    cep: somenteDigitos(textoLimpo(raw.cep)).slice(0, 8),
    logradouro: textoLimpo(raw.logradouro),
    numero: textoLimpo(raw.numero),
    complemento: textoLimpo(raw.complemento),
    bairro: textoLimpo(raw.bairro),
    cidade: textoLimpo(raw.cidade),
    uf,
    codigo_municipio_ibge: somenteDigitos(textoLimpo(raw.codigo_municipio_ibge)).slice(0, 7),
    pais: textoLimpo(raw.pais) || 'Brasil',
  }
}

export function normalizarDadosFiscaisOficina(
  raw?: Partial<DadosFiscaisOficina> | null | unknown
): DadosFiscaisOficina {
  if (!isRecord(raw)) {
    return {
      ...DADOS_FISCAIS_OFICINA_VAZIO,
      endereco: { ...DADOS_FISCAIS_OFICINA_VAZIO.endereco! },
      tipos_documento_pretendidos: [],
    }
  }

  const regimeRaw = textoLimpo(raw.regime_tributario)
  const regime =
    regimeRaw && REGIMES.has(regimeRaw) ? (regimeRaw as RegimeTributario) : ('' as const)

  const ambienteRaw = textoLimpo(raw.ambiente)
  const ambiente: AmbienteFiscal =
    ambienteRaw && AMBIENTES.has(ambienteRaw)
      ? (ambienteRaw as AmbienteFiscal)
      : 'homologacao'

  const tiposRaw = Array.isArray(raw.tipos_documento_pretendidos)
    ? raw.tipos_documento_pretendidos
    : []
  const tipos = tiposRaw
    .map((t) => String(t))
    .filter((t): t is TipoDocumentoFiscalPretendido => TIPOS_DOC.has(t))

  return {
    cnpj: somenteDigitos(textoLimpo(raw.cnpj)).slice(0, 14),
    razao_social: textoLimpo(raw.razao_social),
    nome_fantasia: textoLimpo(raw.nome_fantasia),
    inscricao_estadual: textoLimpo(raw.inscricao_estadual),
    inscricao_municipal: textoLimpo(raw.inscricao_municipal),
    regime_tributario: regime,
    cnae_principal: textoLimpo(raw.cnae_principal),
    email_fiscal: textoLimpo(raw.email_fiscal).toLowerCase(),
    telefone_fiscal: textoLimpo(raw.telefone_fiscal),
    endereco: normalizarEndereco(raw.endereco),
    ambiente,
    tipos_documento_pretendidos: tipos,
    atualizado_em: textoLimpo(raw.atualizado_em) || undefined,
  }
}

export function obterDadosFiscaisOficina(
  configuracao?: { fiscal?: DadosFiscaisOficina | null } | null | unknown
): DadosFiscaisOficina {
  if (!isRecord(configuracao)) {
    return normalizarDadosFiscaisOficina(null)
  }
  return normalizarDadosFiscaisOficina(configuracao.fiscal)
}

/** Critério F2: CNPJ, razão social, cidade, UF e regime. */
export function cadastroFiscalBasicoPreenchido(dados: DadosFiscaisOficina): boolean {
  const n = normalizarDadosFiscaisOficina(dados)
  const cnpjOk = somenteDigitos(n.cnpj).length === 14
  const razaoOk = Boolean(n.razao_social?.trim())
  const cidadeOk = Boolean(n.endereco?.cidade?.trim())
  const ufOk = Boolean(n.endereco?.uf && ufFiscalValida(n.endereco.uf) && n.endereco.uf.length === 2)
  const regimeOk = Boolean(n.regime_tributario && REGIMES.has(n.regime_tributario))
  return cnpjOk && razaoOk && cidadeOk && ufOk && regimeOk
}

export function labelStatusCadastroFiscal(dados: DadosFiscaisOficina): {
  completo: boolean
  label: string
} {
  const completo = cadastroFiscalBasicoPreenchido(dados)
  return {
    completo,
    label: completo ? 'Cadastro fiscal básico preenchido' : 'Cadastro fiscal incompleto',
  }
}

/**
 * Prefill a partir dos dados comerciais da oficina (sem sobrescrever o que já está no fiscal).
 */
export function mesclarPrefillFiscalComercial(
  fiscal: DadosFiscaisOficina,
  comercial: {
    cnpj?: string
    nome?: string
    nome_fantasia?: string
    email?: string
    telefone?: string
    endereco?: string
    bairro?: string
    cidade?: string
    estado?: string
    cep?: string
  }
): DadosFiscaisOficina {
  const base = normalizarDadosFiscaisOficina(fiscal)
  const end = { ...base.endereco! }
  return {
    ...base,
    cnpj: base.cnpj || somenteDigitos(comercial.cnpj).slice(0, 14),
    razao_social: base.razao_social || textoLimpo(comercial.nome),
    nome_fantasia: base.nome_fantasia || textoLimpo(comercial.nome_fantasia),
    email_fiscal: base.email_fiscal || textoLimpo(comercial.email).toLowerCase(),
    telefone_fiscal: base.telefone_fiscal || textoLimpo(comercial.telefone),
    endereco: {
      ...end,
      logradouro: end.logradouro || textoLimpo(comercial.endereco),
      bairro: end.bairro || textoLimpo(comercial.bairro),
      cidade: end.cidade || textoLimpo(comercial.cidade),
      uf: end.uf || textoLimpo(comercial.estado).toUpperCase().slice(0, 2),
      cep: end.cep || somenteDigitos(comercial.cep).slice(0, 8),
      pais: end.pais || 'Brasil',
    },
  }
}
