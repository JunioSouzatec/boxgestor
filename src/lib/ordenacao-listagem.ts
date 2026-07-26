/** Ordenação operacional: mais recentes primeiro (clientes, veículos). OS: ver compararOsListagem. */

export interface EntidadeComCriacao {
  id?: string
  created_at?: string
  criado_em?: string
  updated_at?: string
  atualizado_em?: string
}

export interface OsParaListagem extends EntidadeComCriacao {
  numero?: number | null
}

/**
 * Lista principal de OS: número desc → criação desc → atualização desc → id desc.
 */
export function compararOsListagem(a: OsParaListagem, b: OsParaListagem): number {
  const na = Number(a.numero)
  const nb = Number(b.numero)
  const aNum = Number.isFinite(na) ? na : -1
  const bNum = Number.isFinite(nb) ? nb : -1
  if (aNum !== bNum) return bNum - aNum

  const criadoA = a.created_at || a.criado_em || ''
  const criadoB = b.created_at || b.criado_em || ''
  if (criadoA !== criadoB) return criadoB.localeCompare(criadoA)

  const updA = a.updated_at || a.atualizado_em || ''
  const updB = b.updated_at || b.atualizado_em || ''
  if (updA !== updB) return updB.localeCompare(updA)

  return (b.id ?? '').localeCompare(a.id ?? '')
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
