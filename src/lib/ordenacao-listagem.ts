/** Ordenação operacional: mais recentes primeiro (clientes, veículos, OS). */

export interface EntidadeComCriacao {
  id?: string
  created_at?: string
  criado_em?: string
  updated_at?: string
  atualizado_em?: string
}

/** Preferir created_at → criado_em → updated_at → atualizado_em → id. */
export function timestampCriacaoListagem(e: EntidadeComCriacao): string {
  return e.created_at || e.criado_em || e.updated_at || e.atualizado_em || e.id || ''
}

/** Comparador: mais novo primeiro. */
export function compararMaisRecentePrimeiro(
  a: EntidadeComCriacao,
  b: EntidadeComCriacao
): number {
  const ta = timestampCriacaoListagem(a)
  const tb = timestampCriacaoListagem(b)
  if (ta !== tb) return tb.localeCompare(ta)
  return (b.id ?? '').localeCompare(a.id ?? '')
}

export function ordenarMaisRecentesPrimeiro<T extends EntidadeComCriacao>(lista: T[]): T[] {
  return [...lista].sort(compararMaisRecentePrimeiro)
}
