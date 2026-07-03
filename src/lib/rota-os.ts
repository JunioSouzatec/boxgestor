import type { OrdemServico } from '@/types'

/** Rota da visualização completa da OS (sempre pelo id interno). */
export function rotaVisualizarOs(os: Pick<OrdemServico, 'id'>): string {
  return `/ordens-servico/${os.id}/visualizar`
}

export function logDevAbrirVisualizacaoOs(osId: string): void {
  if (import.meta.env.DEV) {
    console.info('[OS] Abrindo visualização completa', osId)
  }
}

/** Aceita id interno ou número da OS (ex.: 1016) na URL. */
export function resolverOsPorParametroRota(
  ordens: OrdemServico[],
  param?: string
): OrdemServico | null {
  if (!param) return null
  const porId = ordens.find((o) => o.id === param)
  if (porId) return porId
  const numero = Number(param)
  if (!Number.isNaN(numero)) {
    return ordens.find((o) => o.numero === numero) ?? null
  }
  return null
}
