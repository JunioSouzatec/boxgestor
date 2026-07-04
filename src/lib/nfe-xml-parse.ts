/** Utilitários para ler XML de NF-e no navegador (sem envio ao servidor). */

function findFirstByLocalName(root: Document | Element, localName: string): Element | null {
  const start = root instanceof Document ? root.documentElement : root
  if (!start) return null
  const stack: Element[] = [start]
  while (stack.length) {
    const el = stack.pop()!
    if (el.localName === localName) return el
    for (let i = el.children.length - 1; i >= 0; i--) {
      stack.push(el.children[i])
    }
  }
  return null
}

function findAllByLocalName(root: Document | Element, localName: string): Element[] {
  const start = root instanceof Document ? root.documentElement : root
  if (!start) return []
  const results: Element[] = []
  const stack: Element[] = [start]
  while (stack.length) {
    const el = stack.pop()!
    if (el.localName === localName) results.push(el)
    for (let i = el.children.length - 1; i >= 0; i--) {
      stack.push(el.children[i])
    }
  }
  return results
}

function childText(parent: Element, localName: string): string | undefined {
  for (const child of Array.from(parent.children)) {
    if (child.localName === localName) {
      const t = child.textContent?.trim()
      return t || undefined
    }
  }
  return undefined
}

function parseNumeroXml(valor?: string): number {
  if (!valor?.trim()) return 0
  const n = Number(valor.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export interface ProdutoNfeXml {
  indice: number
  codigo: string
  descricao: string
  ncm?: string
  cfop?: string
  unidade: string
  quantidade: number
  custoUnitario: number
  valorTotal: number
  codigoBarras?: string
}

export interface NotaFiscalNfeXml {
  chave?: string
  numero?: string
  serie?: string
  dataEmissao?: string
  cnpjEmitente?: string
  nomeEmitente?: string
  valorTotal?: number
  produtos: ProdutoNfeXml[]
}

function eanValido(cEAN?: string): string | undefined {
  if (!cEAN?.trim()) return undefined
  const t = cEAN.trim()
  if (/^sem\s*gtin$/i.test(t)) return undefined
  const digits = t.replace(/\D/g, '')
  return digits.length >= 8 ? digits : undefined
}

function extrairDataEmissao(ide: Element): string | undefined {
  const dh = childText(ide, 'dhEmi') ?? childText(ide, 'dEmi')
  if (!dh) return undefined
  return dh.includes('T') ? dh.slice(0, 10) : dh.slice(0, 10)
}

function extrairProdutos(infNFe: Element): ProdutoNfeXml[] {
  const detalhes = findAllByLocalName(infNFe, 'det')
  const produtos: ProdutoNfeXml[] = []

  detalhes.forEach((det, idx) => {
    const prod =
      Array.from(det.children).find((c) => c.localName === 'prod') ??
      findFirstByLocalName(det, 'prod')
    if (!prod) return

    const descricao = childText(prod, 'xProd')?.trim()
    if (!descricao) return

    produtos.push({
      indice: idx + 1,
      codigo: childText(prod, 'cProd')?.trim() || `ITEM-${idx + 1}`,
      descricao,
      ncm: childText(prod, 'NCM'),
      cfop: childText(prod, 'CFOP'),
      unidade: childText(prod, 'uCom')?.trim() || 'UN',
      quantidade: parseNumeroXml(childText(prod, 'qCom')),
      custoUnitario: parseNumeroXml(childText(prod, 'vUnCom')),
      valorTotal: parseNumeroXml(childText(prod, 'vProd')),
      codigoBarras: eanValido(childText(prod, 'cEAN') ?? childText(prod, 'cBarra')),
    })
  })

  return produtos
}

function extrairChaveNfe(infNFe: Element, doc: Document): string | undefined {
  const idAttr = infNFe.getAttribute('Id') ?? infNFe.getAttribute('id')
  if (idAttr) {
    const digits = idAttr.replace(/^NFe/i, '').replace(/\D/g, '')
    if (digits.length === 44) return digits
  }

  const chNFe = findFirstByLocalName(doc, 'chNFe')
  if (chNFe?.textContent) {
    const digits = chNFe.textContent.replace(/\D/g, '')
    if (digits.length === 44) return digits
  }

  return undefined
}

export function parsearXmlNfe(conteudo: string): NotaFiscalNfeXml {
  const parser = new DOMParser()
  const doc = parser.parseFromString(conteudo, 'application/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('XML_INVALIDO')
  }

  const infNFe = findFirstByLocalName(doc, 'infNFe')
  if (!infNFe) {
    throw new Error('XML_INVALIDO')
  }

  const ide = Array.from(infNFe.children).find((c) => c.localName === 'ide')
  const emit = Array.from(infNFe.children).find((c) => c.localName === 'emit')
  const total = findFirstByLocalName(infNFe, 'ICMSTot')

  const produtos = extrairProdutos(infNFe)
  if (produtos.length === 0) {
    throw new Error('SEM_PRODUTOS')
  }

  return {
    chave: extrairChaveNfe(infNFe, doc),
    numero: ide ? childText(ide, 'nNF') : undefined,
    serie: ide ? childText(ide, 'serie') : undefined,
    dataEmissao: ide ? extrairDataEmissao(ide) : undefined,
    cnpjEmitente: emit
      ? childText(emit, 'CNPJ') ?? childText(emit, 'CPF')
      : undefined,
    nomeEmitente: emit ? childText(emit, 'xNome') : undefined,
    valorTotal: total ? parseNumeroXml(childText(total, 'vNF')) : undefined,
    produtos,
  }
}
