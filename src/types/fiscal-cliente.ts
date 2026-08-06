/**
 * Dados fiscais do cliente (F3B) — preparação para NFC-e/NF-e/NFS-e.
 * Persistidos em customers.metadata.fiscal (requer migration JSONB).
 * Não emite nota. Não consulta Receita/SEFAZ.
 */
import {
  emailFiscalValido,
  formatarCepExibicao,
  formatarCnpjExibicao,
  somenteDigitos,
  ufFiscalValida,
  type EnderecoFiscalOficina,
} from '@/types/fiscal'

export type TipoPessoaFiscalCliente = 'fisica' | 'juridica'

export type IndicadorIeCliente = 'contribuinte' | 'isento' | 'nao_contribuinte'

export interface DadosFiscaisCliente {
  tipo_pessoa?: TipoPessoaFiscalCliente | ''
  cpf?: string
  cnpj?: string
  razao_social?: string
  nome_fantasia?: string
  inscricao_estadual?: string
  indicador_ie?: IndicadorIeCliente | ''
  inscricao_municipal?: string
  email_fiscal?: string
  telefone_fiscal?: string
  endereco?: EnderecoFiscalOficina
  atualizado_em?: string
}

export interface MetadataCliente {
  fiscal?: DadosFiscaisCliente
  [chave: string]: unknown
}

export const TIPOS_PESSOA_FISCAL_CLIENTE: Array<{
  value: TipoPessoaFiscalCliente
  label: string
}> = [
  { value: 'fisica', label: 'Pessoa física' },
  { value: 'juridica', label: 'Pessoa jurídica' },
]

export const INDICADORES_IE_CLIENTE: Array<{
  value: IndicadorIeCliente
  label: string
}> = [
  { value: 'contribuinte', label: 'Contribuinte' },
  { value: 'isento', label: 'Isento' },
  { value: 'nao_contribuinte', label: 'Não contribuinte' },
]

export const DADOS_FISCAIS_CLIENTE_VAZIO: DadosFiscaisCliente = {
  tipo_pessoa: '',
  cpf: '',
  cnpj: '',
  razao_social: '',
  nome_fantasia: '',
  inscricao_estadual: '',
  indicador_ie: '',
  inscricao_municipal: '',
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
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function textoLimpo(v: unknown): string {
  if (v == null) return ''
  const s = String(v).trim()
  if (!s || s === 'undefined' || s === 'null') return ''
  return s
}

export function formatarCpfExibicao(cpf: string | undefined | null): string {
  const d = somenteDigitos(cpf).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export { formatarCepExibicao, formatarCnpjExibicao, somenteDigitos }

function normalizarEnderecoFiscalCliente(raw: unknown): EnderecoFiscalOficina {
  const base = { ...DADOS_FISCAIS_CLIENTE_VAZIO.endereco! }
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

const TIPOS = new Set<string>(TIPOS_PESSOA_FISCAL_CLIENTE.map((t) => t.value))
const INDICADORES = new Set<string>(INDICADORES_IE_CLIENTE.map((i) => i.value))

export function normalizarDadosFiscaisCliente(
  raw?: Partial<DadosFiscaisCliente> | null | unknown
): DadosFiscaisCliente {
  if (!isRecord(raw)) {
    return {
      ...DADOS_FISCAIS_CLIENTE_VAZIO,
      endereco: { ...DADOS_FISCAIS_CLIENTE_VAZIO.endereco! },
    }
  }

  const tipoRaw = textoLimpo(raw.tipo_pessoa)
  const tipo =
    tipoRaw && TIPOS.has(tipoRaw) ? (tipoRaw as TipoPessoaFiscalCliente) : ('' as const)

  const indRaw = textoLimpo(raw.indicador_ie)
  const indicador =
    indRaw && INDICADORES.has(indRaw) ? (indRaw as IndicadorIeCliente) : ('' as const)

  return {
    tipo_pessoa: tipo,
    cpf: somenteDigitos(textoLimpo(raw.cpf)).slice(0, 11),
    cnpj: somenteDigitos(textoLimpo(raw.cnpj)).slice(0, 14),
    razao_social: textoLimpo(raw.razao_social),
    nome_fantasia: textoLimpo(raw.nome_fantasia),
    inscricao_estadual: textoLimpo(raw.inscricao_estadual),
    indicador_ie: indicador,
    inscricao_municipal: textoLimpo(raw.inscricao_municipal),
    email_fiscal: textoLimpo(raw.email_fiscal),
    telefone_fiscal: somenteDigitos(textoLimpo(raw.telefone_fiscal)).slice(0, 13),
    endereco: normalizarEnderecoFiscalCliente(raw.endereco),
    atualizado_em: textoLimpo(raw.atualizado_em) || undefined,
  }
}

/** Lê fiscal do metadata; se CPF fiscal vazio, herda o CPF legado do cliente. */
export function obterDadosFiscaisCliente(cliente?: {
  cpf?: string | null
  metadata?: MetadataCliente | null
} | null): DadosFiscaisCliente {
  const base = normalizarDadosFiscaisCliente(cliente?.metadata?.fiscal)
  const cpfLegado = somenteDigitos(cliente?.cpf).slice(0, 11)
  if (!base.cpf && cpfLegado) {
    base.cpf = cpfLegado
    if (!base.tipo_pessoa) base.tipo_pessoa = 'fisica'
  }
  return base
}

export function cadastroFiscalClienteBasicoPreenchido(
  fiscal: DadosFiscaisCliente,
  nomeCliente?: string
): boolean {
  const n = normalizarDadosFiscaisCliente(fiscal)
  const cidadeOk = Boolean(n.endereco?.cidade?.trim())
  const ufOk = Boolean(n.endereco?.uf && ufFiscalValida(n.endereco.uf) && n.endereco.uf.length === 2)

  if (n.tipo_pessoa === 'juridica') {
    const nomeOk = Boolean(n.razao_social?.trim() || nomeCliente?.trim())
    const cnpjOk = somenteDigitos(n.cnpj).length === 14
    return nomeOk && cnpjOk && cidadeOk && ufOk
  }

  // PF (ou tipo ainda não escolhido): critério básico PF
  const nomeOk = Boolean(nomeCliente?.trim())
  const cpfOk = somenteDigitos(n.cpf).length === 11
  return nomeOk && cpfOk && cidadeOk && ufOk
}

export function labelStatusFiscalCliente(
  fiscal: DadosFiscaisCliente,
  nomeCliente?: string
): { completo: boolean; label: string } {
  const completo = cadastroFiscalClienteBasicoPreenchido(fiscal, nomeCliente)
  return {
    completo,
    label: completo ? 'Fiscal básico preenchido' : 'Fiscal incompleto',
  }
}

/** Validação leve — não bloqueia CPF/CNPJ ausentes. */
export function validarDadosFiscaisClienteLeve(fiscal: DadosFiscaisCliente): string | null {
  const n = normalizarDadosFiscaisCliente(fiscal)
  const cpf = somenteDigitos(n.cpf)
  if (cpf && cpf.length !== 11) return 'CPF fiscal deve ter 11 dígitos.'
  const cnpj = somenteDigitos(n.cnpj)
  if (cnpj && cnpj.length !== 14) return 'CNPJ deve ter 14 dígitos.'
  if (!ufFiscalValida(n.endereco?.uf)) return 'UF fiscal inválida (use 2 letras).'
  if (!emailFiscalValido(n.email_fiscal)) return 'E-mail fiscal inválido.'
  const cep = somenteDigitos(n.endereco?.cep)
  if (cep && cep.length !== 8) return 'CEP fiscal deve ter 8 dígitos.'
  return null
}

export function normalizarDadosFiscaisClienteParaPersistir(
  fiscal: DadosFiscaisCliente
): DadosFiscaisCliente {
  const n = normalizarDadosFiscaisCliente(fiscal)
  return {
    ...n,
    cpf: n.cpf || undefined,
    cnpj: n.cnpj || undefined,
    razao_social: n.razao_social || undefined,
    nome_fantasia: n.nome_fantasia || undefined,
    inscricao_estadual: n.inscricao_estadual || undefined,
    indicador_ie: n.indicador_ie || undefined,
    inscricao_municipal: n.inscricao_municipal || undefined,
    email_fiscal: n.email_fiscal || undefined,
    telefone_fiscal: n.telefone_fiscal || undefined,
    tipo_pessoa: n.tipo_pessoa || undefined,
    endereco: {
      ...n.endereco!,
      cep: n.endereco?.cep || undefined,
      logradouro: n.endereco?.logradouro || undefined,
      numero: n.endereco?.numero || undefined,
      complemento: n.endereco?.complemento || undefined,
      bairro: n.endereco?.bairro || undefined,
      cidade: n.endereco?.cidade || undefined,
      uf: n.endereco?.uf || undefined,
      codigo_municipio_ibge: n.endereco?.codigo_municipio_ibge || undefined,
      pais: n.endereco?.pais || 'Brasil',
    },
    atualizado_em: n.atualizado_em ?? new Date().toISOString(),
  }
}

export function montarMetadataClienteComFiscal(
  metadataAtual: MetadataCliente | undefined,
  fiscal: DadosFiscaisCliente
): MetadataCliente {
  return {
    ...(metadataAtual ?? {}),
    fiscal: normalizarDadosFiscaisClienteParaPersistir(fiscal),
  }
}

/** Merge seguro de metadata (não apaga chaves desconhecidas). */
export function mesclarMetadataCliente(
  preferido?: MetadataCliente | null,
  fallback?: MetadataCliente | null
): MetadataCliente | undefined {
  if (!preferido && !fallback) return undefined
  const base: MetadataCliente = { ...(fallback ?? {}), ...(preferido ?? {}) }
  const fiscalPref = preferido?.fiscal
  const fiscalFall = fallback?.fiscal
  if (fiscalPref || fiscalFall) {
    base.fiscal = normalizarDadosFiscaisClienteParaPersistir({
      ...normalizarDadosFiscaisCliente(fiscalFall),
      ...normalizarDadosFiscaisCliente(fiscalPref),
    })
  }
  return base
}

/**
 * Compatibilidade CPF legado ↔ fiscal:
 * - PF: CPF fiscal prevalece se preenchido; senão mantém legado.
 * - PJ: não força CNPJ na coluna cpf.
 */
export function resolverCpfLegadoDoFiscal(
  fiscal: DadosFiscaisCliente,
  cpfLegado?: string | null
): string | undefined {
  const n = normalizarDadosFiscaisCliente(fiscal)
  if (n.tipo_pessoa === 'juridica') {
    return somenteDigitos(cpfLegado).slice(0, 11) || undefined
  }
  const cpfFiscal = somenteDigitos(n.cpf)
  if (cpfFiscal.length >= 11) return cpfFiscal.slice(0, 11)
  const legado = somenteDigitos(cpfLegado)
  return legado || undefined
}
