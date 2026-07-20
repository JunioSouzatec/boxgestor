import { entidadeFoiExcluida } from '@/lib/entidade-ativa'
import type { CraftDatabase, Cliente, Moto, OrdemServico, Peca } from '@/types'
import type { MovimentacaoEstoque } from '@/types/movimentacao-estoque'

function tsEntidade(e: { updated_at?: string; atualizado_em?: string }): string {
  return e.updated_at || e.atualizado_em || ''
}

/**
 * Após um fetch remoto longo, reaplicar entidade locais editadas
 * depois do início do fetch — evita “salvar e depois voltar”.
 * Não reaplica exclusão local sobre registro remoto ainda ativo.
 */
function preferirEdicoesLocaisRecentes<T extends { id: string; updated_at?: string; atualizado_em?: string; deleted_at?: string | null; ativo?: boolean }>(
  remoto: T[],
  local: T[],
  fetchIniciadoEm: string
): T[] {
  const map = new Map(remoto.map((r) => [r.id, r]))
  for (const l of local) {
    const rem = map.get(l.id)
    if (rem && entidadeFoiExcluida(rem) && !entidadeFoiExcluida(l)) {
      // Remoto excluído: nunca ressuscitar com cache ativo local
      continue
    }
    if (rem && !entidadeFoiExcluida(rem) && entidadeFoiExcluida(l)) {
      const ts = tsEntidade(l)
      // Exclusão local durante o fetch: preservar tombstone pendente de publish
      if (ts && ts > fetchIniciadoEm) {
        map.set(l.id, l)
      }
      // Tombstone local antigo não esconde remoto ativo
      continue
    }
    const ts = tsEntidade(l)
    if (ts && ts > fetchIniciadoEm) {
      map.set(l.id, l)
      continue
    }
    if (!map.has(l.id)) {
      if (entidadeFoiExcluida(l)) {
        // Tombstone só local (ainda não no remoto) — manter para o push
        map.set(l.id, l)
        continue
      }
      map.set(l.id, l)
    }
  }
  return Array.from(map.values())
}

export function mesclarPreservandoEdicoesConcorrentes(
  remotoMerged: CraftDatabase,
  localAtual: CraftDatabase,
  fetchIniciadoEm: string
): CraftDatabase {
  return {
    ...remotoMerged,
    clientes: preferirEdicoesLocaisRecentes<Cliente>(
      remotoMerged.clientes,
      localAtual.clientes,
      fetchIniciadoEm
    ),
    motos: preferirEdicoesLocaisRecentes<Moto>(
      remotoMerged.motos,
      localAtual.motos,
      fetchIniciadoEm
    ),
    ordens_servico: preferirEdicoesLocaisRecentes<OrdemServico>(
      remotoMerged.ordens_servico,
      localAtual.ordens_servico,
      fetchIniciadoEm
    ),
    pecas: (() => {
      const remotoPorId = new Map((remotoMerged.pecas ?? []).map((p) => [p.id, p]))
      const preferidas = preferirEdicoesLocaisRecentes<Peca>(
        remotoMerged.pecas ?? [],
        (localAtual.pecas ?? []).filter((p) => {
          const rem = remotoPorId.get(p.id)
          // Remoto excluído: não reaplicar peça ativa local durante o fetch
          if (rem && entidadeFoiExcluida(rem) && !entidadeFoiExcluida(p)) return false
          return true
        }),
        fetchIniciadoEm
      )
      return preferidas.map((p) => {
        const rem = remotoPorId.get(p.id)
        if (rem && entidadeFoiExcluida(rem)) {
          return {
            ...rem,
            quantidade: rem.quantidade,
            deleted_at: rem.deleted_at ?? rem.updated_at ?? null,
            ativo: false,
          }
        }
        return rem && !entidadeFoiExcluida(rem)
          ? {
              ...p,
              ...rem,
              quantidade: rem.quantidade,
              deleted_at: rem.deleted_at ?? null,
              ativo: rem.ativo !== false && !rem.deleted_at,
            }
          : p
      })
    })(),
    fornecedores: preferirEdicoesLocaisRecentes(
      remotoMerged.fornecedores ?? [],
      localAtual.fornecedores ?? [],
      fetchIniciadoEm
    ),
    movimentacoes_estoque: preferirEdicoesLocaisRecentes<MovimentacaoEstoque>(
      remotoMerged.movimentacoes_estoque ?? [],
      localAtual.movimentacoes_estoque ?? [],
      fetchIniciadoEm
    ),
    lancamentos: preferirEdicoesLocaisRecentes(
      remotoMerged.lancamentos ?? [],
      localAtual.lancamentos ?? [],
      fetchIniciadoEm
    ),
    proximo_numero_os: Math.max(
      remotoMerged.proximo_numero_os ?? 1,
      localAtual.proximo_numero_os ?? 1
    ),
  }
}
