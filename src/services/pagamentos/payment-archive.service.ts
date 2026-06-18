import { getCraftPersistenceMode, getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { obterClientPaymentId } from '@/services/pagamentos/payment-dedupe.helpers'
import {
  buildCraftMetaArquivado,
  isPagamentoOsAtivo,
} from '@/services/pagamentos/payment-active.helpers'
import { calcularResumoFinanceiroOS, sugerirStatusFinanceiro } from '@/services/os-financeiro.service'
import { localCraftRepository } from '@/services/repository/local.repository'
import { removerOrfaosDaFilaSync } from '@/services/pagamentos/payment-orphan.service'
import type { CraftDatabase } from '@/types/database'
import { getDataLocalHoje } from '@/lib/data-local'
import type { LancamentoFinanceiro } from '@/types/financeiro'

async function atualizarLinhaArquivada(
  tabela: 'service_order_payments' | 'financial_transactions',
  officeUuid: string,
  filtro: { coluna: string; valor: string },
  meta: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return

  const { data } = await supabase
    .from(tabela)
    .select('id, craft_meta')
    .eq('office_id', officeUuid)
    .eq(filtro.coluna, filtro.valor)
    .maybeSingle<{ id: string; craft_meta: Record<string, unknown> | null }>()

  if (!data?.id) return

  await supabase
    .from(tabela)
    .update({
      craft_meta: { ...(data.craft_meta ?? {}), ...meta },
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', data.id)
}

export async function arquivarPagamentoNoSupabase(
  officeLocalId: string,
  lancamento: LancamentoFinanceiro,
  status: 'archived' | 'deleted' = 'deleted'
): Promise<void> {
  if (getCraftPersistenceMode() !== 'supabase' || !isSupabaseConfigured()) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return

  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  if (!contexto?.officeUuid) return

  const officeUuid = contexto.officeUuid
  const meta = buildCraftMetaArquivado(lancamento, status) as unknown as Record<string, unknown>
  const clientPaymentId = obterClientPaymentId(lancamento)

  if (lancamento.payment_supabase_id) {
    await atualizarLinhaArquivada(
      'service_order_payments',
      officeUuid,
      { coluna: 'id', valor: lancamento.payment_supabase_id },
      meta
    )
  } else if (clientPaymentId) {
    await atualizarLinhaArquivada(
      'service_order_payments',
      officeUuid,
      { coluna: 'client_payment_id', valor: clientPaymentId },
      meta
    )
  }

  await atualizarLinhaArquivada(
    'financial_transactions',
    officeUuid,
    { coluna: 'client_payment_id', valor: clientPaymentId },
    meta
  )

  const { data: finPorLocal } = await getSupabaseClient()
    ?.from('financial_transactions')
    .select('id, craft_meta')
    .eq('office_id', officeUuid)
    .filter('craft_meta->>local_id', 'eq', lancamento.id)
    .maybeSingle<{ id: string; craft_meta: Record<string, unknown> | null }>() ?? { data: null }

  if (finPorLocal?.id) {
    await getSupabaseClient()
      ?.from('financial_transactions')
      .update({
        craft_meta: { ...(finPorLocal.craft_meta ?? {}), ...meta },
        paid: false,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', finPorLocal.id)
  }
}

export function atualizarStatusFinanceiroOrdens(
  db: CraftDatabase,
  osIds?: Set<string>
): CraftDatabase {
  const alvo = osIds ?? new Set(db.ordens_servico.map((o) => o.id))

  return {
    ...db,
    ordens_servico: db.ordens_servico.map((os) => {
      if (!alvo.has(os.id)) return os
      const resumo = calcularResumoFinanceiroOS(os, db.lancamentos)
      const status = sugerirStatusFinanceiro(resumo.totalGeral, resumo.valorPago, os.status)
      if (os.status_financeiro === status) return os
      return {
        ...os,
        status_financeiro: status,
        atualizado_em: getDataLocalHoje(),
      }
    }),
  }
}

export async function processarArquivamentoPagamentos(
  officeLocalId: string,
  db: CraftDatabase,
  lancamentoIds: string[],
  status: 'archived' | 'deleted' = 'deleted'
): Promise<CraftDatabase> {
  if (lancamentoIds.length === 0) return db

  const ids = new Set(lancamentoIds)
  const osAfetadas = new Set<string>()

  for (const l of db.lancamentos) {
    if (!ids.has(l.id) || !l.ordem_servico_id) continue
    osAfetadas.add(l.ordem_servico_id)
    await arquivarPagamentoNoSupabase(officeLocalId, l, status)
  }

  removerOrfaosDaFilaSync(officeLocalId, lancamentoIds)

  let atualizado: CraftDatabase = {
    ...db,
    lancamentos: db.lancamentos.map((l) =>
      ids.has(l.id) ? { ...l, sync_pendente: false } : l
    ),
  }

  atualizado = atualizarStatusFinanceiroOrdens(atualizado, osAfetadas)
  localCraftRepository.salvar(officeLocalId, atualizado)
  return atualizado
}

export interface DiagnosticoPagamentosOs {
  supabase: number
  locais: number
  ativos: number
  ignorados: number
  valorPago: number
  valorPendente: number
}

export function diagnosticarPagamentosOs(
  osId: string,
  lancamentos: LancamentoFinanceiro[],
  totalGeral: number,
  origem?: { supabase?: number; locais?: number }
): DiagnosticoPagamentosOs {
  const daOs = lancamentos.filter((l) => l.ordem_servico_id === osId && l.tipo === 'receita')
  const ativos = daOs.filter(isPagamentoOsAtivo)
  const valorPago = ativos.filter((l) => l.pago).reduce((acc, l) => acc + l.valor, 0)

  return {
    supabase: origem?.supabase ?? daOs.filter((l) => l.payment_supabase_id).length,
    locais: origem?.locais ?? daOs.length,
    ativos: ativos.length,
    ignorados: daOs.length - ativos.length,
    valorPago,
    valorPendente: Math.max(0, totalGeral - valorPago),
  }
}
