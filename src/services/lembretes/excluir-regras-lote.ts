import type { RegraLembrete } from '@/types/lembrete'
import {
  marcarRegraLembreteExcluida,
  regraLembreteFoiExcluida,
} from '@/services/lembretes/regra-lembrete-identidade'

export interface ResultadoExclusaoRegrasLote {
  marcadas: string[]
  jaExcluidas: string[]
  naoEncontradas: string[]
}

export type ResultadoExclusaoRegrasLoteUi = ResultadoExclusaoRegrasLote & {
  sincronizado: boolean
}

function idsUnicosSolicitados(ids: readonly string[]): string[] {
  const vistos = new Set<string>()
  const unicos: string[] = []
  for (const id of ids) {
    if (typeof id !== 'string' || !id || vistos.has(id)) continue
    vistos.add(id)
    unicos.push(id)
  }
  return unicos
}

/**
 * Aplica tombstone somente nos IDs pedidos e ativos.
 * Não detecta duplicata semântica e não altera lembretes/histórico.
 */
export function aplicarExclusaoRegrasEmLote(
  regras: RegraLembrete[],
  ids: readonly string[],
  agora: string
): { regras: RegraLembrete[]; resultado: ResultadoExclusaoRegrasLote } {
  const indicePorId = new Map(regras.map((regra, indice) => [regra.id, indice]))
  const proximas = regras.slice()
  const resultado: ResultadoExclusaoRegrasLote = {
    marcadas: [],
    jaExcluidas: [],
    naoEncontradas: [],
  }

  for (const id of idsUnicosSolicitados(ids)) {
    const indice = indicePorId.get(id)
    if (indice == null) {
      resultado.naoEncontradas.push(id)
      continue
    }
    const atual = proximas[indice]
    if (regraLembreteFoiExcluida(atual)) {
      resultado.jaExcluidas.push(id)
      continue
    }
    proximas[indice] = marcarRegraLembreteExcluida(atual, agora)
    resultado.marcadas.push(id)
  }

  return { regras: proximas, resultado }
}

/** Recorta somente as linhas dos IDs afetados — inclusive tombstones — para um único envio. */
export function selecionarRegrasParaPersistenciaDirecionada(
  regras: readonly RegraLembrete[],
  ids: readonly string[]
): RegraLembrete[] {
  const pedidos = new Set(idsUnicosSolicitados(ids))
  if (pedidos.size === 0) return []
  return regras.filter((regra) => pedidos.has(regra.id))
}
