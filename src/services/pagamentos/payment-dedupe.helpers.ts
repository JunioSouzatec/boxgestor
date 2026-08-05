import {
  isPagamentoOsAtivo,
  marcarPagamentoArquivado,
} from '@/services/pagamentos/payment-active.helpers'
import type { CraftDatabase } from '@/types/database'
import type { LancamentoFinanceiro } from '@/types/financeiro'

export function obterClientPaymentId(lancamento: LancamentoFinanceiro): string {
  return (lancamento.client_payment_id ?? lancamento.id).trim()
}

/** Assinatura para detectar pagamentos repetidos na mesma OS */
export function assinaturaPagamentoOs(l: LancamentoFinanceiro): string | null {
  if (!isPagamentoOsAtivo(l)) return null
  const obs = (l.observacao ?? '').trim()
  return [
    l.ordem_servico_id,
    l.valor.toFixed(2),
    l.forma_pagamento,
    l.data,
    obs,
  ].join('|')
}

export function ehPagamentoOsReceita(l: LancamentoFinanceiro): boolean {
  return isPagamentoOsAtivo(l)
}

export function isPagamentoOrfaoOuArquivado(l: LancamentoFinanceiro): boolean {
  return Boolean(l.sync_orfao || l.sync_arquivado)
}

export function precisaSincronizarPagamento(l: LancamentoFinanceiro): boolean {
  if (l.cancelado || isPagamentoOrfaoOuArquivado(l)) return false
  // Atualizações locais (ex.: marcar conta como paga) precisam reenviar mesmo com UUID remoto.
  if (l.sync_pendente) return true
  if (l.payment_supabase_id) return false
  if (!ehPagamentoOsReceita(l) && l.tipo !== 'receita' && l.tipo !== 'despesa') return false
  if (ehPagamentoOsReceita(l) && !l.payment_supabase_id) return true
  return false
}

function tsLancamento(l: LancamentoFinanceiro): string {
  return l.updated_at || l.atualizado_em || l.created_at || l.criado_em || ''
}

/**
 * Prefere Pago sobre Pendente; depois LWW por updated_at.
 * Evita remoto antigo (pago=false) ou duplicata pendente sobrescrever pago local.
 */
export function preferirLancamentoMaisRecente(
  a: LancamentoFinanceiro,
  b: LancamentoFinanceiro
): LancamentoFinanceiro {
  if (a.pago !== b.pago) return a.pago ? a : b
  const ta = tsLancamento(a)
  const tb = tsLancamento(b)
  if (ta && tb && ta !== tb) return ta > tb ? a : b
  if (ta && !tb) return a
  if (tb && !ta) return b
  if (a.payment_supabase_id && !b.payment_supabase_id) return a
  if (b.payment_supabase_id && !a.payment_supabase_id) return b
  return a
}

function pontuacaoPagamentoPrincipal(l: LancamentoFinanceiro): number {
  let score = 0
  if (l.payment_supabase_id) score += 100
  if (l.client_payment_id && l.client_payment_id === l.id) score += 10
  if (!l.sync_pendente) score += 5
  return score
}

/** Escolhe qual pagamento manter em um grupo de duplicatas */
export function escolherPagamentoPrincipal(
  grupo: LancamentoFinanceiro[]
): LancamentoFinanceiro {
  return [...grupo].sort((a, b) => {
    const diff = pontuacaoPagamentoPrincipal(b) - pontuacaoPagamentoPrincipal(a)
    if (diff !== 0) return diff
    const ca = a.created_at ?? a.criado_em ?? ''
    const cb = b.created_at ?? b.criado_em ?? ''
    if (ca !== cb) return ca.localeCompare(cb)
    return a.id.localeCompare(b.id)
  })[0]
}

export interface GrupoDuplicataPagamento {
  chave: string
  ordem_servico_id: string
  os_numero?: number
  pagamentos: LancamentoFinanceiro[]
  manter: LancamentoFinanceiro
  remover: LancamentoFinanceiro[]
}

export function detectarPagamentosDuplicados(
  dados: CraftDatabase,
  filtroOsId?: string
): GrupoDuplicataPagamento[] {
  const mapa = new Map<string, LancamentoFinanceiro[]>()

  for (const l of dados.lancamentos) {
    if (!ehPagamentoOsReceita(l)) continue
    if (filtroOsId && l.ordem_servico_id !== filtroOsId) continue
    const chave = assinaturaPagamentoOs(l)
    if (!chave) continue
    const lista = mapa.get(chave) ?? []
    lista.push(l)
    mapa.set(chave, lista)
  }

  const grupos: GrupoDuplicataPagamento[] = []

  for (const [chave, pagamentos] of mapa) {
    if (pagamentos.length <= 1) continue
    const manter = escolherPagamentoPrincipal(pagamentos)
    const remover = pagamentos.filter((p) => p.id !== manter.id)
    const os = dados.ordens_servico.find((o) => o.id === manter.ordem_servico_id)
    grupos.push({
      chave,
      ordem_servico_id: manter.ordem_servico_id!,
      os_numero: os?.numero,
      pagamentos,
      manter,
      remover,
    })
  }

  return grupos.sort(
    (a, b) => (a.os_numero ?? 0) - (b.os_numero ?? 0) || a.chave.localeCompare(b.chave)
  )
}

export interface ResultadoReparoPagamentos {
  db: CraftDatabase
  removidos: number
  grupos: number
}

/** Marca duplicatas como canceladas (soft delete) — nunca apaga sem confirmação prévia */
export function repararPagamentosDuplicados(
  dados: CraftDatabase,
  grupos: GrupoDuplicataPagamento[]
): ResultadoReparoPagamentos {
  const idsRemover = new Set(grupos.flatMap((g) => g.remover.map((p) => p.id)))
  if (idsRemover.size === 0) {
    return { db: dados, removidos: 0, grupos: 0 }
  }

  const db: CraftDatabase = {
    ...dados,
    lancamentos: dados.lancamentos.map((l) =>
      idsRemover.has(l.id) ? marcarPagamentoArquivado(l) : l
    ),
  }

  return { db, removidos: idsRemover.size, grupos: grupos.length }
}

export function mesclarLancamentosSemDuplicata(
  local: LancamentoFinanceiro[],
  remoto: LancamentoFinanceiro[]
): LancamentoFinanceiro[] {
  const porId = new Map<string, LancamentoFinanceiro>()
  const porClientPayment = new Map<string, LancamentoFinanceiro>()
  const porSupabaseId = new Map<string, LancamentoFinanceiro>()

  function registrar(l: LancamentoFinanceiro): void {
    if (!isPagamentoOsAtivo(l) && l.ordem_servico_id) {
      porId.set(l.id, l)
      return
    }

    const existente = porId.get(l.id)
    porId.set(l.id, existente ? preferirLancamentoMaisRecente(existente, l) : l)

    const cp = obterClientPaymentId(l)
    if (cp) {
      const exCp = porClientPayment.get(cp)
      porClientPayment.set(cp, exCp ? preferirLancamentoMaisRecente(exCp, l) : l)
    }
    if (l.payment_supabase_id) {
      const exSb = porSupabaseId.get(l.payment_supabase_id)
      porSupabaseId.set(
        l.payment_supabase_id,
        exSb ? preferirLancamentoMaisRecente(exSb, l) : l
      )
    }
  }

  for (const l of remoto) {
    registrar(l)
  }

  for (const l of local) {
    const cp = obterClientPaymentId(l)
    const inativoLocal = !isPagamentoOsAtivo(l)

    if (cp && porClientPayment.has(cp)) {
      const remotoCp = porClientPayment.get(cp)!
      if (inativoLocal) {
        porId.set(l.id, {
          ...remotoCp,
          ...l,
          cancelado: true,
          sync_arquivado: true,
          pago: false,
          payment_supabase_id: remotoCp.payment_supabase_id ?? l.payment_supabase_id,
        })
        continue
      }
      if (remotoCp.id !== l.id) {
        // Mesmo client_payment_id com IDs distintos: LWW (antes o remoto ganhava sempre).
        const vencedor = preferirLancamentoMaisRecente(remotoCp, {
          ...l,
          payment_supabase_id: l.payment_supabase_id ?? remotoCp.payment_supabase_id,
          client_payment_id: cp,
        })
        porId.set(vencedor.id, {
          ...vencedor,
          sync_pendente: false,
          payment_supabase_id: vencedor.payment_supabase_id ?? remotoCp.payment_supabase_id,
          client_payment_id: cp,
        })
        if (vencedor.id !== l.id) {
          porId.delete(l.id)
        }
        continue
      }
    }

    if (l.payment_supabase_id && porSupabaseId.has(l.payment_supabase_id)) {
      const remotoSb = porSupabaseId.get(l.payment_supabase_id)!
      if (inativoLocal) {
        porId.set(l.id, {
          ...remotoSb,
          ...l,
          cancelado: true,
          sync_arquivado: true,
          pago: false,
        })
        continue
      }
      if (remotoSb.id !== l.id) {
        const vencedor = preferirLancamentoMaisRecente(remotoSb, l)
        porId.set(vencedor.id, vencedor)
        if (vencedor.id !== l.id) porId.delete(l.id)
        continue
      }
    }

    if (inativoLocal) {
      registrar(l)
      continue
    }

    registrar(l)
  }

  return deduplicarPorCounterSale(
    [...porId.values()].sort(
      (a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id)
    )
  )
}

/** Dedupe local de receitas VB (mesmo counter_sale_id / client_payment_id). */
function deduplicarPorCounterSale(
  lancamentos: LancamentoFinanceiro[]
): LancamentoFinanceiro[] {
  const porChave = new Map<string, LancamentoFinanceiro>()
  const resultado: LancamentoFinanceiro[] = []
  const agora = new Date().toISOString()

  function chaveVb(l: LancamentoFinanceiro): string | null {
    if (l.tipo !== 'receita' || l.cancelado || l.sync_arquivado) return null
    const cp = l.client_payment_id ?? ''
    if (cp.startsWith('counter-sale-payment:')) return cp
    const m = l.observacao?.match(/counter_sale_id:([^\s·]+)/)
    return m?.[1] ? `counter-sale-payment:${m[1]}` : null
  }

  for (const l of lancamentos) {
    const chave = chaveVb(l)
    if (!chave) {
      resultado.push(l)
      continue
    }
    const atual = porChave.get(chave)
    if (!atual) {
      porChave.set(chave, l)
      continue
    }
    const vencedor = preferirLancamentoMaisRecente(atual, l)
    const perdedor = vencedor.id === atual.id ? l : atual
    porChave.set(chave, vencedor)
    console.info('[Financeiro][dedupe-counter-sale]', {
      chave,
      mantido: vencedor.id,
      arquivado: perdedor.id,
      pago_mantido: vencedor.pago,
    })
    resultado.push({
      ...perdedor,
      cancelado: true,
      sync_arquivado: true,
      sync_pendente: false,
      pago: false,
      sync_orfao_motivo: 'Duplicata venda balcão (merge)',
      updated_at: agora,
      atualizado_em: agora.slice(0, 10),
    })
  }

  for (const v of porChave.values()) {
    resultado.push(v)
  }

  return resultado.sort(
    (a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id)
  )
}
