/** Normaliza espaços e trim para comparação de trechos de voz. */
export function normalizarEspacosTranscricao(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

/**
 * Mescla um trecho final novo ao acumulado, evitando duplicação por resultados
 * progressivos do Web Speech API (ex.: "farol" → "farol esquerdo" → "farol esquerdo arranhado").
 */
export function mesclarTrechoFinalTranscricao(acumulado: string, novo: string): string {
  const a = normalizarEspacosTranscricao(acumulado)
  const n = normalizarEspacosTranscricao(novo)
  if (!n) return a
  if (!a) return n

  const aLower = a.toLowerCase()
  const nLower = n.toLowerCase()

  if (aLower === nLower) return a
  if (aLower.includes(nLower) && n.length <= a.length) return a
  if (nLower.startsWith(aLower)) return n

  const palavrasA = a.split(/\s+/)
  const palavrasN = n.split(/\s+/)

  for (let overlap = Math.min(palavrasA.length, palavrasN.length); overlap >= 1; overlap--) {
    const sufixoA = palavrasA.slice(-overlap).join(' ').toLowerCase()
    const prefixoN = palavrasN.slice(0, overlap).join(' ').toLowerCase()
    if (sufixoA === prefixoN) {
      return normalizarEspacosTranscricao(
        [...palavrasA.slice(0, -overlap), ...palavrasN].join(' ')
      )
    }
  }

  if (nLower.endsWith(aLower) && n.length > a.length) return n

  return normalizarEspacosTranscricao(`${a} ${n}`)
}

export function montarTranscricaoExibida(finalTexto: string, interimTexto: string): string {
  const f = normalizarEspacosTranscricao(finalTexto)
  const i = normalizarEspacosTranscricao(interimTexto)
  if (!f) return i
  if (!i) return f

  const fLower = f.toLowerCase()
  const iLower = i.toLowerCase()
  if (iLower.startsWith(fLower)) return i
  if (fLower.endsWith(iLower)) return f

  return normalizarEspacosTranscricao(`${f} ${i}`)
}
