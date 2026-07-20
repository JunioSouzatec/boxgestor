import { entidadeFoiExcluida } from '@/lib/entidade-ativa'
import type { Fornecedor } from '@/types/fornecedor'
import type { Peca } from '@/types/peca'

export interface OpcoesMesclagemEstoque {
  /** Lista = remoto + itens locais ativos ainda não publicados no Supabase */
  fonteVerdadeRemota?: boolean
  /** Quantity do Supabase sempre substitui o local quando a peça existe no remoto */
  quantidadeRemotaVence?: boolean
}

function tsPeca(p: Peca): string {
  return p.updated_at ?? p.created_at ?? ''
}

/**
 * Catálogo de peças: Supabase define existência, com exceções:
 * - Remoto excluído → tombstone remoto sempre vence (não ressuscitar).
 * - Local excluído mais novo que remoto ativo → mantém exclusão pendente de publish.
 * - Tombstone local antigo NÃO esconde peça ativa remota (outro device recriou/nunca apagou).
 */
export function mesclarPecasEstoque(
  local: Peca[],
  remoto: Peca[],
  opcoes?: OpcoesMesclagemEstoque
): Peca[] {
  const quantidadeRemotaVence = opcoes?.quantidadeRemotaVence !== false
  const fonteRemota = opcoes?.fonteVerdadeRemota !== false

  const remotoPorCodigo = new Map<string, Peca>()
  for (const r of remoto) {
    const cod = r.codigo?.trim().toLowerCase()
    if (cod && !entidadeFoiExcluida(r)) remotoPorCodigo.set(cod, r)
  }

  if (fonteRemota) {
    const resultado: Peca[] = remoto.map((r) => {
      const localMatch = local.find((l) => l.id === r.id)
      const remExcluido = entidadeFoiExcluida(r)
      const locExcluido = localMatch ? entidadeFoiExcluida(localMatch) : false

      // Soft-delete remoto é definitivo até alguém criar de novo com outro id
      if (remExcluido) {
        return {
          ...r,
          quantidade: r.quantidade,
          deleted_at: r.deleted_at ?? r.updated_at ?? new Date().toISOString(),
          ativo: false,
        }
      }

      // Exclusão local mais nova que o remoto ativo → preservar tombstone até o push
      if (localMatch && locExcluido && !remExcluido) {
        const tsL = tsPeca(localMatch)
        const tsR = tsPeca(r)
        if (tsL && tsR && tsL > tsR) {
          return {
            ...r,
            ...localMatch,
            quantidade: r.quantidade,
            deleted_at: localMatch.deleted_at,
            ativo: false,
            updated_at: localMatch.updated_at ?? tsL,
          }
        }
      }

      if (!quantidadeRemotaVence || !localMatch) return r
      return {
        ...localMatch,
        ...r,
        quantidade: r.quantidade,
        deleted_at: r.deleted_at ?? null,
        ativo: r.ativo !== false && !r.deleted_at,
      }
    })

    const idsRemotos = new Set(remoto.map((r) => r.id))
    for (const item of local) {
      if (idsRemotos.has(item.id)) continue
      if (entidadeFoiExcluida(item)) {
        // Tombstone só local (ainda não no Supabase) — manter para o push publicar
        resultado.push(item)
        continue
      }
      const cod = item.codigo?.trim().toLowerCase()
      if (cod && remotoPorCodigo.has(cod)) continue
      resultado.push(item)
    }
    return resultado
  }

  // Fallback LWW: remoto excluído nunca perde para local ativo
  const porId = new Map<string, Peca>()
  for (const r of remoto) porId.set(r.id, r)
  for (const l of local) {
    const existente = porId.get(l.id)
    if (!existente) {
      porId.set(l.id, l)
      continue
    }
    if (entidadeFoiExcluida(existente)) {
      // Mantém tombstone remoto
      continue
    }
    if (entidadeFoiExcluida(l) && tsPeca(l) > tsPeca(existente)) {
      porId.set(l.id, l)
      continue
    }
    if (entidadeFoiExcluida(l)) {
      // Local excluído mais antigo que remoto ativo — remoto vence
      continue
    }
    const tsR = tsPeca(existente)
    const tsL = tsPeca(l)
    const chosen = tsL >= tsR ? l : existente
    if (quantidadeRemotaVence) {
      porId.set(l.id, { ...chosen, quantidade: existente.quantidade })
    } else {
      porId.set(l.id, chosen)
    }
  }
  return [...porId.values()]
}

export function mesclarFornecedoresEstoque(
  local: Fornecedor[],
  remoto: Fornecedor[],
  opcoes?: OpcoesMesclagemEstoque
): Fornecedor[] {
  const fonteVerdadeRemota = opcoes?.fonteVerdadeRemota ?? false

  if (fonteVerdadeRemota) {
    const idsRemotos = new Set(remoto.map((item) => item.id))
    const resultado = [...remoto]
    for (const item of local) {
      if (idsRemotos.has(item.id)) continue
      if (entidadeFoiExcluida(item)) continue
      resultado.push(item)
    }
    return resultado
  }

  const porId = new Map<string, Fornecedor>()
  for (const item of remoto) porId.set(item.id, item)
  for (const item of local) {
    const existente = porId.get(item.id)
    if (!existente) {
      porId.set(item.id, item)
      continue
    }
    if (!entidadeFoiExcluida(existente) && entidadeFoiExcluida(item)) continue
    if (entidadeFoiExcluida(existente) && !entidadeFoiExcluida(item)) continue
    const tsR = existente.updated_at ?? ''
    const tsL = item.updated_at ?? ''
    porId.set(item.id, tsL >= tsR ? item : existente)
  }
  return [...porId.values()]
}
