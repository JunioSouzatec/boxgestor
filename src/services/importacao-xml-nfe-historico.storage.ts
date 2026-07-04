import type { NotaFiscalNfeXml } from '@/lib/nfe-xml-parse'

export const IMPORTACAO_XML_NFE_HISTORICO_KEY = 'craft_importacao_xml_nfe_v1'

export interface RegistroImportacaoXmlNfe {
  id: string
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

function normalizarCnpj(cnpj?: string): string {
  return cnpj?.replace(/\D/g, '') ?? ''
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
  localStorage.setItem(IMPORTACAO_XML_NFE_HISTORICO_KEY, JSON.stringify(store))
}

function obterRegistrosOficina(store: HistoricoImportacaoXmlNfeStore, officeId: string): RegistroImportacaoXmlNfe[] {
  return store.offices[officeId]?.registros ?? []
}

function registrosCoincidem(nota: NotaFiscalNfeXml, registro: RegistroImportacaoXmlNfe): boolean {
  const chaveNota = nota.chave?.replace(/\D/g, '')
  const chaveRegistro = registro.chave?.replace(/\D/g, '')
  if (chaveNota && chaveNota.length === 44 && chaveRegistro && chaveRegistro.length === 44) {
    return chaveNota === chaveRegistro
  }

  const cnpjNota = normalizarCnpj(nota.cnpjEmitente)
  const cnpjRegistro = normalizarCnpj(registro.cnpjFornecedor)
  const numeroNota = nota.numero?.trim()
  const numeroRegistro = registro.numero?.trim()
  const serieNota = nota.serie?.trim()
  const serieRegistro = registro.serie?.trim()

  if (!numeroNota || !numeroRegistro || numeroNota !== numeroRegistro) return false
  if (cnpjNota.length < 11 || cnpjRegistro.length < 11 || cnpjNota !== cnpjRegistro) return false

  if (serieNota && serieRegistro) {
    return serieNota === serieRegistro
  }

  return true
}

export function buscarImportacaoXmlNfeAnterior(
  officeId: string,
  nota: NotaFiscalNfeXml
): RegistroImportacaoXmlNfe | undefined {
  const registros = obterRegistrosOficina(carregarStore(), officeId)
  return registros.find((r) => registrosCoincidem(nota, r))
}

export function registrarImportacaoXmlNfe(
  officeId: string,
  nota: NotaFiscalNfeXml,
  fornecedor: { nome?: string; cnpj?: string },
  quantidadeItens: number
): RegistroImportacaoXmlNfe {
  const store = carregarStore()
  if (!store.offices[officeId]) {
    store.offices[officeId] = { registros: [] }
  }

  const existente = store.offices[officeId].registros.find((r) => registrosCoincidem(nota, r))
  const agora = new Date().toISOString()

  if (existente) {
    existente.importadoEm = agora
    existente.vezesImportada += 1
    existente.quantidadeItens = quantidadeItens
    if (nota.valorTotal != null) existente.valorTotal = nota.valorTotal
    salvarStore(store)
    return existente
  }

  const novo: RegistroImportacaoXmlNfe = {
    id: `nfe-imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    chave: nota.chave,
    numero: nota.numero,
    serie: nota.serie,
    cnpjFornecedor: fornecedor.cnpj ?? nota.cnpjEmitente,
    nomeFornecedor: fornecedor.nome ?? nota.nomeEmitente,
    dataEmissao: nota.dataEmissao,
    valorTotal: nota.valorTotal,
    importadoEm: agora,
    quantidadeItens,
    vezesImportada: 1,
  }

  store.offices[officeId].registros.unshift(novo)
  if (store.offices[officeId].registros.length > 200) {
    store.offices[officeId].registros = store.offices[officeId].registros.slice(0, 200)
  }

  salvarStore(store)
  return novo
}
