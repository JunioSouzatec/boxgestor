/**
 * Datas de negócio no fuso America/Sao_Paulo.
 * Não usar toISOString().slice(0,10) para "hoje", cadastro ou filtros por dia.
 */

export const FUSO_BRASIL = 'America/Sao_Paulo'

/** Formata um instante para YYYY-MM-DD no fuso do Brasil. */
export function formatarInstantParaDataBrasil(data: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_BRASIL,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(data)
}

/** Data de hoje no fuso do Brasil: YYYY-MM-DD */
export function getDataLocalHoje(referencia = new Date()): string {
  return formatarInstantParaDataBrasil(referencia)
}

/** Formata Date para YYYY-MM-DD no fuso do Brasil */
export function formatarDataLocalYYYYMMDD(data: Date): string {
  return formatarInstantParaDataBrasil(data)
}

/**
 * Extrai YYYY-MM-DD de string ISO, datetime ou data pura, sempre no fuso Brasil.
 * Strings já no formato YYYY-MM-DD são preservadas (data de negócio).
 */
export function extrairDataBrasilYYYYMMDD(valor: string, fallback = getDataLocalHoje()): string {
  const trimmed = valor.trim()
  if (!trimmed) return fallback
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return fallback
  return formatarInstantParaDataBrasil(d)
}

/**
 * Exibe data em pt-BR no fuso Brasil.
 * Aceita YYYY-MM-DD ou ISO completo — evita o bug de new Date('YYYY-MM-DD') virar dia anterior.
 */
export function formatarDataBrasil(valor: string): string {
  const ymd = extrairDataBrasilYYYYMMDD(valor)
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_BRASIL,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parseDataLocal(ymd))
}

/** Mês atual no fuso Brasil: YYYY-MM */
export function getMesLocalAtual(referencia = new Date()): string {
  const ymd = formatarInstantParaDataBrasil(referencia)
  return ymd.slice(0, 7)
}

/**
 * Compara duas datas YYYY-MM-DD (sem horário).
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

/** Interpreta YYYY-MM-DD como meio-dia (evita borda de DST ao formatar). */
export function parseDataLocal(data: string): Date {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, mes - 1, dia, 12, 0, 0, 0)
}

export function dataLocalEhHoje(data: string, hoje = getDataLocalHoje()): boolean {
  return compararDatasLocais(extrairDataBrasilYYYYMMDD(data), hoje) === 0
}

export function dataLocalEhVencida(data: string, hoje = getDataLocalHoje()): boolean {
  return compararDatasLocais(extrairDataBrasilYYYYMMDD(data), hoje) < 0
}

export function dataLocalEhFutura(data: string, hoje = getDataLocalHoje()): boolean {
  return compararDatasLocais(extrairDataBrasilYYYYMMDD(data), hoje) > 0
}
