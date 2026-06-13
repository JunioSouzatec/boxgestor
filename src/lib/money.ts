/** Utilitários para valores monetários (BRL) */

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/** Exibição formatada: R$ 99,97 */
export function formatMoneyDisplay(valor: number): string {
  return moneyFormatter.format(valor)
}

/** Texto editável sem prefixo: 99,97 */
export function formatMoneyEditable(valor: number): string {
  return valor.toFixed(2).replace('.', ',')
}

/**
 * Converte texto digitado em número.
 * Aceita: 99,97 · 99.97 · R$ 99,97 · 1.234,56
 */
export function parseMoneyInput(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed) return 0

  let s = trimmed.replace(/\s/g, '').replace(/^R\$\s?/i, '')

  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.')
  }

  const n = parseFloat(s)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n * 100) / 100)
}

/** Durante digitação — mantém apenas caracteres válidos */
export function sanitizeMoneyTyping(raw: string): string {
  return raw.replace(/[^\d,.]/g, '')
}
