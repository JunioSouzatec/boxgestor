/**
 * Projeção read-only de estoque por papel (Fase B.1).
 *
 * ATENÇÃO:
 * - Uso exclusivo na UI (listas/tabelas/cards de leitura).
 * - NÃO substitui RLS/backend — a proteção real de trânsito fica na Fase C.
 * - NUNCA usar objetos sanitizados em salvar, push, sync, merge ou baixa de estoque.
 * - A fonte canônica (CraftContext / cache / Supabase) permanece intacta.
 */

import type { AuthUser, PapelUsuario } from '@/types/auth'
import type { MovimentacaoEstoque } from '@/types/movimentacao-estoque'
import type { Peca } from '@/types/peca'
import {
  podeVerCustosEstoque,
  type PermissoesContext,
} from '@/services/auth/permissions'

type UserOrPapel = AuthUser | PapelUsuario

function podeVerCustos(
  userOrPapel: UserOrPapel | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!userOrPapel) return false
  return podeVerCustosEstoque(userOrPapel, config)
}

/** Cópia sanitizada para leitura — sem custo, fornecedor ou dados de compra. */
export function sanitizarPecaParaLeitura(
  peca: Peca,
  userOrPapel: UserOrPapel | null | undefined,
  config?: PermissoesContext
): Peca {
  if (podeVerCustos(userOrPapel, config)) return peca

  return {
    ...peca,
    custo: 0,
    fornecedor_id: undefined,
  }
}

export function sanitizarPecasParaLeitura(
  pecas: Peca[] | null | undefined,
  userOrPapel: UserOrPapel | null | undefined,
  config?: PermissoesContext
): Peca[] {
  const lista = Array.isArray(pecas) ? pecas : []
  if (podeVerCustos(userOrPapel, config)) return lista
  return lista.map((p) => sanitizarPecaParaLeitura(p, userOrPapel, config))
}

/** Cópia sanitizada — sem valores financeiros, fornecedor ou nota fiscal. */
export function sanitizarMovimentacaoEstoqueParaLeitura(
  mov: MovimentacaoEstoque,
  userOrPapel: UserOrPapel | null | undefined,
  config?: PermissoesContext
): MovimentacaoEstoque {
  if (podeVerCustos(userOrPapel, config)) return mov

  return {
    ...mov,
    valor_unitario: 0,
    valor_total: 0,
    fornecedor_id: undefined,
    fornecedor_nome: undefined,
    numero_nota: undefined,
  }
}

export function sanitizarMovimentacoesEstoqueParaLeitura(
  movs: MovimentacaoEstoque[] | null | undefined,
  userOrPapel: UserOrPapel | null | undefined,
  config?: PermissoesContext
): MovimentacaoEstoque[] {
  const lista = Array.isArray(movs) ? movs : []
  if (podeVerCustos(userOrPapel, config)) return lista
  return lista.map((m) =>
    sanitizarMovimentacaoEstoqueParaLeitura(m, userOrPapel, config)
  )
}
