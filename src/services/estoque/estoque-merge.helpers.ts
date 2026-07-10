import { entidadeFoiExcluida, resolverEntidadeMesclada } from '@/lib/entidade-ativa'
import type { Fornecedor } from '@/types/fornecedor'
import type { Peca } from '@/types/peca'

export interface OpcoesMesclagemEstoque {
  /** Lista = remoto + itens locais ativos ainda não publicados no Supabase */
  fonteVerdadeRemota?: boolean
}

function mesclarEntidadesEstoque<T extends {
  id: string
  updated_at?: string
  created_at?: string
  deleted_at?: string | null
  ativo?: boolean
}>(
  local: T[],
  remoto: T[],
  opcoes?: OpcoesMesclagemEstoque
): T[] {
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

  const porId = new Map<string, T>()
  for (const item of remoto) porId.set(item.id, item)

  for (const item of local) {
    const existente = porId.get(item.id)
    if (!existente) {
      porId.set(item.id, item)
      continue
    }
    porId.set(item.id, resolverEntidadeMesclada(existente, item))
  }

  return [...porId.values()]
}

export function mesclarPecasEstoque(
  local: Peca[],
  remoto: Peca[],
  opcoes?: OpcoesMesclagemEstoque
): Peca[] {
  return mesclarEntidadesEstoque(local, remoto, opcoes)
}

export function mesclarFornecedoresEstoque(
  local: Fornecedor[],
  remoto: Fornecedor[],
  opcoes?: OpcoesMesclagemEstoque
): Fornecedor[] {
  return mesclarEntidadesEstoque(local, remoto, opcoes)
}
