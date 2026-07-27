export interface SecaoManual {
  id: string
  titulo: string
  corpo: string
}

const ORDEM_SECOES = [
  'Primeiros passos',
  'Clientes e veículos',
  'Orçamentos e OS',
  'Checklist e fotos',
  'Pagamentos e financeiro',
  'Caixa',
  'Permissões',
  'Estoque',
  'Comunicação',
  'Offline',
  'Gestor Inteligente',
  'Perguntas frequentes',
  'Roadmap',
] as const

function slugify(titulo: string): string {
  return titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function normalizarBuscaManual(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Extrai seções `## Título` do markdown do manual. */
export function parseSecoesManual(markdown: string): SecaoManual[] {
  const linhas = markdown.replace(/\r\n/g, '\n').split('\n')
  const secoes: SecaoManual[] = []
  let tituloAtual: string | null = null
  let buffer: string[] = []

  const flush = () => {
    if (!tituloAtual) return
    secoes.push({
      id: slugify(tituloAtual),
      titulo: tituloAtual,
      corpo: buffer.join('\n').trim(),
    })
    buffer = []
  }

  for (const linha of linhas) {
    const m = /^##\s+(.+)\s*$/.exec(linha)
    if (m) {
      flush()
      tituloAtual = m[1].trim()
      continue
    }
    if (tituloAtual) buffer.push(linha)
  }
  flush()

  const ordem = new Map(ORDEM_SECOES.map((t, i) => [normalizarBuscaManual(t), i]))
  return secoes.sort((a, b) => {
    const ia = ordem.get(normalizarBuscaManual(a.titulo))
    const ib = ordem.get(normalizarBuscaManual(b.titulo))
    if (ia !== undefined && ib !== undefined) return ia - ib
    if (ia !== undefined) return -1
    if (ib !== undefined) return 1
    return a.titulo.localeCompare(b.titulo, 'pt-BR')
  })
}

export function filtrarSecoesManual(secoes: SecaoManual[], busca: string): SecaoManual[] {
  const q = normalizarBuscaManual(busca)
  if (!q) return secoes
  return secoes.filter((s) => {
    const hay = normalizarBuscaManual(`${s.titulo}\n${s.corpo}`)
    return hay.includes(q)
  })
}

type Bloco =
  | { tipo: 'p'; texto: string }
  | { tipo: 'ul'; itens: string[] }
  | { tipo: 'ol'; itens: string[] }
  | { tipo: 'table'; headers: string[]; rows: string[][] }

function parseInlineBold(texto: string): Array<string | { bold: string }> {
  const parts: Array<string | { bold: string }> = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    if (m.index > last) parts.push(texto.slice(last, m.index))
    parts.push({ bold: m[1] })
    last = m.index + m[0].length
  }
  if (last < texto.length) parts.push(texto.slice(last))
  return parts.length ? parts : [texto]
}

function parseTableRow(linha: string): string[] {
  return linha
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

export function parseBlocosManual(corpo: string): Bloco[] {
  const linhas = corpo.replace(/\r\n/g, '\n').split('\n')
  const blocos: Bloco[] = []
  let i = 0

  while (i < linhas.length) {
    const linha = linhas[i]
    const trim = linha.trim()

    if (!trim || trim === '---') {
      i += 1
      continue
    }

    if (trim.startsWith('|') && i + 1 < linhas.length && /^\|?\s*[-:| ]+\s*\|?$/.test(linhas[i + 1].trim())) {
      const headers = parseTableRow(trim)
      i += 2
      const rows: string[][] = []
      while (i < linhas.length && linhas[i].trim().startsWith('|')) {
        rows.push(parseTableRow(linhas[i]))
        i += 1
      }
      blocos.push({ tipo: 'table', headers, rows })
      continue
    }

    if (/^[-*]\s+/.test(trim)) {
      const itens: string[] = []
      while (i < linhas.length && /^[-*]\s+/.test(linhas[i].trim())) {
        itens.push(linhas[i].trim().replace(/^[-*]\s+/, ''))
        i += 1
      }
      blocos.push({ tipo: 'ul', itens })
      continue
    }

    if (/^\d+\.\s+/.test(trim)) {
      const itens: string[] = []
      while (i < linhas.length && /^\d+\.\s+/.test(linhas[i].trim())) {
        itens.push(linhas[i].trim().replace(/^\d+\.\s+/, ''))
        i += 1
      }
      blocos.push({ tipo: 'ol', itens })
      continue
    }

    if (trim.startsWith('### ')) {
      blocos.push({ tipo: 'p', texto: `**${trim.slice(4)}**` })
      i += 1
      continue
    }

    const para: string[] = [trim]
    i += 1
    while (
      i < linhas.length &&
      linhas[i].trim() &&
      linhas[i].trim() !== '---' &&
      !linhas[i].trim().startsWith('|') &&
      !/^[-*]\s+/.test(linhas[i].trim()) &&
      !/^\d+\.\s+/.test(linhas[i].trim()) &&
      !linhas[i].trim().startsWith('### ')
    ) {
      para.push(linhas[i].trim())
      i += 1
    }
    blocos.push({ tipo: 'p', texto: para.join(' ') })
  }

  return blocos
}

export function renderInlineParts(texto: string): Array<string | { bold: string }> {
  return parseInlineBold(texto)
}

export const MANUAL_VERSAO = 'v0.4'
export const MANUAL_PDF_PATH = '/docs/Manual_BoxGestor_v0_4.pdf'
/** Arquivo em public/docs/Manual_BoxGestor_v0_4.pdf */
export const MANUAL_PDF_DISPONIVEL = true
