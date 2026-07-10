/** Entidades com exclusão lógica (deleted_at ou ativo=false). */

export interface ComSoftDelete {
  deleted_at?: string | null
}

export interface ComAtivo {
  ativo?: boolean
}

export function entidadeFoiExcluida(
  entidade: ComSoftDelete & ComAtivo | null | undefined
): boolean {
  if (!entidade) return true
  if (entidade.deleted_at) return true
  if (entidade.ativo === false) return true
  return false
}

export function filtrarEntidadesAtivas<T extends ComSoftDelete & ComAtivo>(
  lista: T[]
): T[] {
  return lista.filter((e) => !entidadeFoiExcluida(e))
}

export function timestampExclusao(
  a?: string | null,
  b?: string | null
): string | undefined {
  if (!a && !b) return undefined
  if (!a) return b ?? undefined
  if (!b) return a
  return a >= b ? a : b
}

/** Mescla duas versões da mesma entidade; exclusão vence sobre alterações. */
export function resolverEntidadeMesclada<T extends ComSoftDelete & ComAtivo & { atualizado_em?: string; updated_at?: string }>(
  a: T,
  b: T
): T {
  const delA = a.deleted_at
  const delB = b.deleted_at
  const inativoA = a.ativo === false
  const inativoB = b.ativo === false

  if (delA || delB || inativoA || inativoB) {
    if ((delA || inativoA) && !(delB || inativoB)) return a
    if ((delB || inativoB) && !(delA || inativoA)) return b
    const tsA = a.updated_at ?? a.atualizado_em ?? delA ?? ''
    const tsB = b.updated_at ?? b.atualizado_em ?? delB ?? ''
    return tsB >= tsA ? b : a
  }

  const ua = a.updated_at ?? a.atualizado_em ?? ''
  const ub = b.updated_at ?? b.atualizado_em ?? ''
  return ub >= ua ? b : a
}
