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
  if (l.payment_supabase_id) return false
  if (!ehPagamentoOsReceita(l) && l.tipo !== 'receita' && l.tipo !== 'despesa') return false
  if (l.sync_pendente) return true
  if (ehPagamentoOsReceita(l) && !l.payment_supabase_id) return true
  return false
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

  function registrar(l: LancamentoFinanceiro, preferirNovo: boolean): void {
    if (!isPagamentoOsAtivo(l) && l.ordem_servico_id) {
      porId.set(l.id, l)
      return
    }

    const existente = porId.get(l.id)
    if (!existente || preferirNovo) {
      porId.set(l.id, l)
    }
    const cp = obterClientPaymentId(l)
    if (cp) {
      const exCp = porClientPayment.get(cp)
      if (!exCp || preferirNovo || (l.payment_supabase_id && !exCp.payment_supabase_id)) {
        porClientPayment.set(cp, l)
      }
    }
    if (l.payment_supabase_id) {
      const exSb = porSupabaseId.get(l.payment_supabase_id)
      if (!exSb || preferirNovo) {
        porSupabaseId.set(l.payment_supabase_id, exSb ?? l)
      }
    }
  }

  for (const l of remoto) {
    registrar(l, true)
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
        porId.set(remotoCp.id, {
          ...remotoCp,
          sync_pendente: false,
          payment_supabase_id: remotoCp.payment_supabase_id ?? l.payment_supabase_id,
          client_payment_id: cp,
        })
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
      if (remotoSb.id !== l.id) continue
    }

    if (inativoLocal) {
      registrar(l, false)
      continue
    }

    registrar(l, false)
  }

  return [...porId.values()].sort(
    (a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id)
  )
}
