/** Parse CSV/TSV com suporte a UTF-8 BOM, aspas e separador , ou ; */
export function parseCsvTexto(texto: string): string[][] {
  const limpo = texto.replace(/^\uFEFF/, '').trim()
  if (!limpo) return []

  const primeiraLinha = limpo.split(/\r?\n/)[0] ?? ''
  const separador = primeiraLinha.includes(';') && !primeiraLinha.includes(',') ? ';' : ','

  const linhas: string[][] = []
  let linhaAtual: string[] = []
  let campo = ''
  let dentroAspas = false

  for (let i = 0; i < limpo.length; i++) {
    const ch = limpo[i]
    const prox = limpo[i + 1]

    if (dentroAspas) {
      if (ch === '"' && prox === '"') {
        campo += '"'
        i++
      } else if (ch === '"') {
        dentroAspas = false
      } else {
        campo += ch
      }
      continue
    }

    if (ch === '"') {
      dentroAspas = true
      continue
    }

    if (ch === separador) {
      linhaAtual.push(campo.trim())
      campo = ''
      continue
    }

    if (ch === '\n' || (ch === '\r' && prox === '\n')) {
      linhaAtual.push(campo.trim())
      if (linhaAtual.some((c) => c.length > 0)) linhas.push(linhaAtual)
      linhaAtual = []
      campo = ''
      if (ch === '\r') i++
      continue
    }

    if (ch === '\r') continue
    campo += ch
  }

  if (campo.length > 0 || linhaAtual.length > 0) {
    linhaAtual.push(campo.trim())
    if (linhaAtual.some((c) => c.length > 0)) linhas.push(linhaAtual)
  }

  return linhas
}

export function linhasCsvParaObjetos(linhas: string[][]): Record<string, string>[] {
  if (linhas.length < 2) return []
  const headers = linhas[0].map((h) => h.trim().toLowerCase())
  return linhas.slice(1).map((cols) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = (cols[i] ?? '').trim()
    })
    return obj
  })
}

export function baixarTextoComoArquivo(conteudo: string, nomeArquivo: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob(['\uFEFF' + conteudo], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
}

export async function lerArquivoComoTexto(arquivo: File): Promise<string> {
  return arquivo.text()
}
