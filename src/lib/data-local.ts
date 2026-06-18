/**
 * Datas de negócio (YYYY-MM-DD) sempre no fuso local do navegador.
 * Não usar toISOString() para "hoje", vencimento ou filtros por dia.
 */

/** Data de hoje no fuso local: YYYY-MM-DD */
export function getDataLocalHoje(referencia = new Date()): string {
  return formatarDataLocalYYYYMMDD(referencia)
}

/** Formata Date para YYYY-MM-DD no fuso local */
export function formatarDataLocalYYYYMMDD(data: Date): string {
  const yyyy = data.getFullYear()
  const mm = String(data.getMonth() + 1).padStart(2, '0')
  const dd = String(data.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Mês atual local: YYYY-MM */
export function getMesLocalAtual(referencia = new Date()): string {
  const yyyy = referencia.getFullYear()
  const mm = String(referencia.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

/**
 * Compara duas datas YYYY-MM-DD (fuso local, sem horário).
 * Retorno: negativo se a < b, zero se iguais, positivo se a > b.
 */
export function compararDatasLocais(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/** Dias entre duas datas YYYY-MM-DD (fim - início). */
export function diasEntreDatasLocais(inicio: string, fim: string): number {
  const a = parseDataLocal(inicio)
  const b = parseDataLocal(fim)
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

/** Interpreta YYYY-MM-DD como meio-dia local (evita borda de DST). */
export function parseDataLocal(data: string): Date {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, mes - 1, dia, 12, 0, 0, 0)
}

export function dataLocalEhHoje(data: string, hoje = getDataLocalHoje()): boolean {
  return compararDatasLocais(data, hoje) === 0
}

export function dataLocalEhVencida(data: string, hoje = getDataLocalHoje()): boolean {
  return compararDatasLocais(data, hoje) < 0
}

export function dataLocalEhFutura(data: string, hoje = getDataLocalHoje()): boolean {
  return compararDatasLocais(data, hoje) > 0
}
