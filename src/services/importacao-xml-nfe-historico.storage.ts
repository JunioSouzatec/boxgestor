import type { NotaFiscalNfeXml } from '@/lib/nfe-xml-parse'
import { OFFICE_ID } from '@/types/base'

export const IMPORTACAO_XML_NFE_HISTORICO_KEY = 'craft_importacao_xml_nfe_v1'

export interface RegistroImportacaoXmlNfe {
  id: string
  officeId: string
  fingerprint: string
  chave?: string
  numero?: string
  serie?: string
  cnpjFornecedor?: string
  nomeFornecedor?: string
  dataEmissao?: string
  valorTotal?: number
  importadoEm: string
  quantidadeItens: number
  vezesImportada: number
}

interface HistoricoOficina {
  registros: RegistroImportacaoXmlNfe[]
}

interface HistoricoImportacaoXmlNfeStore {
  version: 1
  offices: Record<string, HistoricoOficina>
}

export function resolverOfficeIdHistoricoXml(officeId?: string | null): string {
  const id = officeId?.trim()
  if (id) return id
  if (import.meta.env.DEV) {
    console.warn('[Importação XML NF-e] officeId ausente; usando fallback da oficina local.')
  }
  return OFFICE_ID
}

export function normalizarChaveNfe(chave?: string): string {
  return chave?.replace(/\D/g, '') ?? ''
}

export function normalizarCnpjNfe(cnpj?: string): string {
  return cnpj?.replace(/\D/g, '') ?? ''
}

export function normalizarNumeroNota(numero?: string): string {
  const bruto = numero?.trim() ?? ''
  if (!bruto) return ''
  const apenasDigitos = bruto.replace(/\D/g, '')
  if (!apenasDigitos) return bruto
  const semZeros = apenasDigitos.replace(/^0+/, '')
  return semZeros || '0'
}

export function normalizarSerieNota(serie?: string): string {
  const bruto = serie?.trim() ?? ''
  if (!bruto) return ''
  const apenasDigitos = bruto.replace(/\D/g, '')
  if (!apenasDigitos) return bruto
  const semZeros = apenasDigitos.replace(/^0+/, '')
  return semZeros || '0'
}

/** Identificador estável da nota para histórico e detecção de duplicidade. */
export function gerarFingerprintNota(nota: NotaFiscalNfeXml): string | null {
  const chave = normalizarChaveNfe(nota.chave)
  if (chave.length === 44) return `chave:${chave}`

  const numero = normalizarNumeroNota(nota.numero)
  const cnpj = normalizarCnpjNfe(nota.cnpjEmitente)
  const serie = normalizarSerieNota(nota.serie)

  if (!numero || cnpj.length < 11) return null
  if (serie) return `nsc:${numero}|${serie}|${cnpj}`
  return `nc:${numero}|${cnpj}`
}

function carregarStore(): HistoricoImportacaoXmlNfeStore {
  try {
    const raw = localStorage.getItem(IMPORTACAO_XML_NFE_HISTORICO_KEY)
    if (raw) return JSON.parse(raw) as HistoricoImportacaoXmlNfeStore
  } catch {
    /* seed */
  }
  return { version: 1, offices: {} }
}

function salvarStore(store: HistoricoImportacaoXmlNfeStore): void {
  try {
    localStorage.setItem(IMPORTACAO_XML_NFE_HISTORICO_KEY, JSON.stringify(store))
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error('[Importação XML NF-e] Falha ao salvar histórico no localStorage', err)
    }
  }
}

function obterRegistrosOficina(
  store: HistoricoImportacaoXmlNfeStore,
  officeId: string
): RegistroImportacaoXmlNfe[] {
  return store.offices[officeId]?.registros ?? []
}

function registrosCoincidem(nota: NotaFiscalNfeXml, registro: RegistroImportacaoXmlNfe): boolean {
  const fingerprint = gerarFingerprintNota(nota)
  if (fingerprint && registro.fingerprint) {
    return fingerprint === registro.fingerprint
  }

  const chaveNota = normalizarChaveNfe(nota.chave)
  const chaveRegistro = normalizarChaveNfe(registro.chave)
  if (chaveNota.length === 44 && chaveRegistro.length === 44) {
    return chaveNota === chaveRegistro
  }

  const numeroNota = normalizarNumeroNota(nota.numero)
  const numeroRegistro = normalizarNumeroNota(registro.numero)
  const cnpjNota = normalizarCnpjNfe(nota.cnpjEmitente)
  const cnpjRegistro = normalizarCnpjNfe(registro.cnpjFornecedor)
  const serieNota = normalizarSerieNota(nota.serie)
  const serieRegistro = normalizarSerieNota(registro.serie)

  if (!numeroNota || !numeroRegistro || numeroNota !== numeroRegistro) return false
  if (cnpjNota.length < 11 || cnpjRegistro.length < 11 || cnpjNota !== cnpjRegistro) return false

  if (serieNota && serieRegistro) {
    return serieNota === serieRegistro
  }

  return true
}

export function buscarImportacaoXmlNfeAnterior(
  officeId: string | null | undefined,
  nota: NotaFiscalNfeXml
): RegistroImportacaoXmlNfe | undefined {
  const officeResolvido = resolverOfficeIdHistoricoXml(officeId)
  const registros = obterRegistrosOficina(carregarStore(), officeResolvido)
  return registros.find((r) => registrosCoincidem(nota, r))
}

export function registrarImportacaoXmlNfe(
  officeId: string | null | undefined,
  nota: NotaFiscalNfeXml,
  fornecedor: { nome?: string; cnpj?: string },
  quantidadeItens: number
): RegistroImportacaoXmlNfe {
  const officeResolvido = resolverOfficeIdHistoricoXml(officeId)
  const fingerprint = gerarFingerprintNota(nota)

  if (!fingerprint && import.meta.env.DEV) {
    console.warn('[Importação XML NF-e] Nota sem identificador suficiente para histórico', nota)
  }

  const store = carregarStore()
  if (!store.offices[officeResolvido]) {
    store.offices[officeResolvido] = { registros: [] }
  }

  const existente = store.offices[officeResolvido].registros.find((r) =>
    registrosCoincidem(nota, r)
  )
  const agora = new Date().toISOString()
  const cnpjSalvo = normalizarCnpjNfe(fornecedor.cnpj ?? nota.cnpjEmitente)

  if (existente) {
    existente.importadoEm = agora
    existente.vezesImportada += 1
    existente.quantidadeItens = quantidadeItens
    if (nota.valorTotal != null) existente.valorTotal = nota.valorTotal
    if (fingerprint) existente.fingerprint = fingerprint
    if (nota.chave) existente.chave = normalizarChaveNfe(nota.chave)
    if (cnpjSalvo) existente.cnpjFornecedor = cnpjSalvo
    salvarStore(store)
    return existente
  }

  const novo: RegistroImportacaoXmlNfe = {
    id: `nfe-imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    officeId: officeResolvido,
    fingerprint: fingerprint ?? `legado:${Date.now()}`,
    chave: normalizarChaveNfe(nota.chave) || undefined,
    numero: normalizarNumeroNota(nota.numero) || nota.numero,
    serie: normalizarSerieNota(nota.serie) || nota.serie,
    cnpjFornecedor: cnpjSalvo || undefined,
    nomeFornecedor: fornecedor.nome ?? nota.nomeEmitente,
    dataEmissao: nota.dataEmissao,
    valorTotal: nota.valorTotal,
    importadoEm: agora,
    quantidadeItens,
    vezesImportada: 1,
  }

  store.offices[officeResolvido].registros.unshift(novo)
  if (store.offices[officeResolvido].registros.length > 200) {
    store.offices[officeResolvido].registros = store.offices[officeResolvido].registros.slice(0, 200)
  }

  salvarStore(store)
  return novo
}
