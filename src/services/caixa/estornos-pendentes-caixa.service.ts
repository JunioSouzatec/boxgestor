/**
 * Estornos pendentes (Fase 3A ajuste):
 * - Audit refund_pending_no_open_cash quando não há caixa aberto
 * - Listar pendentes e lançar refund no caixa aberto atual
 * - Idempotente (não duplica)
 */

import { isUuidFormato } from '@/lib/local-id-uuid'
import {
  criarMovimentoCaixa,
  listarAuditoriaCaixa,
  obterCaixaAberto,
  registrarAuditoriaCaixa,
} from '@/services/caixa/caixa.service'
import {
  buscarRefundAtivoPorAuditPendenteRemoto,
  buscarRefundAtivoPorPagamentoRemoto,
} from '@/services/caixa/supabase-caixa.persistence'
import type { AuditoriaCaixa, MovimentoCaixa, ResultadoCaixa } from '@/types/caixa'

export interface EstornoPendenteCaixa {
  audit: AuditoriaCaixa
  amount: number
  paymentMethod: string | null
  osLabel: string | null
  ordemServicoId: string | null
  serviceOrderPaymentId: string | null
  clientPaymentId: string | null
  localLancamentoId: string | null
  financialTransactionId: string | null
  saleMovementId: string | null
  saleSessionId: string | null
  actorName: string | null
  cancelledAt: string
}

export type StatusLancarEstornoPendente =
  | 'refund_criado'
  | 'refund_ja_existia'
  | 'sem_caixa_aberto'
  | 'erro'

export interface ResultadoLancarEstornoPendente {
  status: StatusLancarEstornoPendente
  movimento?: MovimentoCaixa
  erro?: string
}

function payloadStr(p: Record<string, unknown>, key: string): string | null {
  const v = p[key]
  if (typeof v === 'string' && v.trim()) return v.trim()
  return null
}

function payloadNum(p: Record<string, unknown>, key: string): number | null {
  const v = p[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function mapearEstornoPendente(a: AuditoriaCaixa): EstornoPendenteCaixa | null {
  if (a.action !== 'refund_pending_no_open_cash') return null
  const p = a.payload ?? {}
  const amount = payloadNum(p, 'amount')
  if (amount == null || amount <= 0) return null

  return {
    audit: a,
    amount,
    paymentMethod: payloadStr(p, 'payment_method'),
    osLabel: payloadStr(p, 'os_label'),
    ordemServicoId: payloadStr(p, 'ordem_servico_id'),
    serviceOrderPaymentId: payloadStr(p, 'service_order_payment_id'),
    clientPaymentId: payloadStr(p, 'client_payment_id'),
    localLancamentoId: payloadStr(p, 'local_lancamento_id'),
    financialTransactionId: payloadStr(p, 'financial_transaction_id'),
    saleMovementId: payloadStr(p, 'sale_movement_id'),
    saleSessionId: payloadStr(p, 'sale_session_id'),
    actorName: a.actor_name?.trim() || null,
    cancelledAt: a.created_at,
  }
}

async function estornoJaResolvido(
  officeId: string,
  pendente: EstornoPendenteCaixa,
  resolvedAuditIds: Set<string>
): Promise<boolean> {
  if (resolvedAuditIds.has(pendente.audit.id)) return true

  const porAudit = await buscarRefundAtivoPorAuditPendenteRemoto(
    officeId,
    pendente.audit.id
  )
  if (porAudit.ok && porAudit.dados) return true

  const porPagamento = await buscarRefundAtivoPorPagamentoRemoto(officeId, {
    serviceOrderPaymentId: pendente.serviceOrderPaymentId,
    clientPaymentId: pendente.clientPaymentId,
    localLancamentoId: pendente.localLancamentoId,
  })
  return Boolean(porPagamento.ok && porPagamento.dados)
}

/**
 * Lista estornos pendentes ainda não lançados como refund ativo.
 */
export async function listarEstornosPendentesCaixa(
  officeId: string
): Promise<ResultadoCaixa<EstornoPendenteCaixa[]>> {
  const audit = await listarAuditoriaCaixa(officeId, undefined, 200)
  if (!audit.ok) {
    return { ok: false, erro: audit.erro ?? 'Não foi possível carregar auditoria.' }
  }

  const logs = audit.dados ?? []
  const resolvedIds = new Set<string>()
  for (const a of logs) {
    if (a.action !== 'refund_pending_resolved') continue
    const id = payloadStr(a.payload ?? {}, 'refund_pending_audit_id')
    if (id) resolvedIds.add(id)
  }

  const candidatos = logs
    .map(mapearEstornoPendente)
    .filter((x): x is EstornoPendenteCaixa => x != null)

  const checagens = await Promise.all(
    candidatos.map(async (p) => ({
      pendente: p,
      resolvido: await estornoJaResolvido(officeId, p, resolvedIds),
    }))
  )

  const pendentes = checagens
    .filter((c) => !c.resolvido)
    .map((c) => c.pendente)
    .sort((a, b) => b.cancelledAt.localeCompare(a.cancelledAt))

  return { ok: true, dados: pendentes }
}

function ehUniqueRefundViolation(erro?: string): boolean {
  const m = (erro ?? '').toLowerCase()
  return (
    m.includes('cash_movements_unique_active_refund_payment') ||
    m.includes('duplicate key') ||
    m.includes('unique constraint')
  )
}

/**
 * Lança refund no caixa aberto atual a partir do audit pendente.
 * Não altera caixa fechado. Idempotente.
 */
export async function lancarEstornoPendenteNoCaixa(params: {
  officeId: string
  auditId: string
  createdBy?: string | null
  createdByName?: string | null
}): Promise<ResultadoLancarEstornoPendente> {
  const officeId = params.officeId.trim()
  const auditId = params.auditId.trim()
  if (!officeId || !auditId || !isUuidFormato(auditId)) {
    return { status: 'erro', erro: 'Estorno pendente inválido.' }
  }

  try {
    const aberto = await obterCaixaAberto(officeId)
    if (!aberto.ok) {
      return { status: 'erro', erro: aberto.erro ?? 'Não foi possível obter o caixa.' }
    }
    if (!aberto.dados || aberto.dados.status !== 'open') {
      return { status: 'sem_caixa_aberto' }
    }

    const lista = await listarEstornosPendentesCaixa(officeId)
    if (!lista.ok) {
      return { status: 'erro', erro: lista.erro }
    }

    // Releitura completa: se já sumiu da lista, buscar refund existente
    let pendente = (lista.dados ?? []).find((p) => p.audit.id === auditId) ?? null

    if (!pendente) {
      const porAudit = await buscarRefundAtivoPorAuditPendenteRemoto(officeId, auditId)
      if (porAudit.ok && porAudit.dados) {
        return { status: 'refund_ja_existia', movimento: porAudit.dados }
      }
      // Pode ter sido resolvido; tenta montar a partir do audit bruto
      const auditAll = await listarAuditoriaCaixa(officeId, undefined, 200)
      const raw = (auditAll.dados ?? []).find((a) => a.id === auditId)
      pendente = raw ? mapearEstornoPendente(raw) : null
      if (!pendente) {
        return { status: 'erro', erro: 'Estorno pendente não encontrado.' }
      }
      const ja = await estornoJaResolvido(officeId, pendente, new Set())
      if (ja) {
        const existente = await buscarRefundAtivoPorPagamentoRemoto(officeId, {
          serviceOrderPaymentId: pendente.serviceOrderPaymentId,
          clientPaymentId: pendente.clientPaymentId,
          localLancamentoId: pendente.localLancamentoId,
        })
        return {
          status: 'refund_ja_existia',
          movimento: existente.ok ? existente.dados ?? undefined : undefined,
        }
      }
    }

    const sopId =
      pendente.serviceOrderPaymentId && isUuidFormato(pendente.serviceOrderPaymentId)
        ? pendente.serviceOrderPaymentId
        : null
    const finId =
      pendente.financialTransactionId && isUuidFormato(pendente.financialTransactionId)
        ? pendente.financialTransactionId
        : null
    const localId = pendente.clientPaymentId || pendente.localLancamentoId || null
    const osLabel = pendente.osLabel
    const notes = osLabel
      ? `Estorno de pagamento de ${osLabel}`
      : 'Estorno de pagamento de OS'

    const criado = await criarMovimentoCaixa({
      officeId,
      cashSessionId: aberto.dados.id,
      type: 'refund',
      amount: pendente.amount,
      paymentMethod: pendente.paymentMethod,
      reason: 'Estorno de pagamento de OS',
      notes,
      createdBy: params.createdBy,
      createdByName: params.createdByName,
      serviceOrderPaymentId: sopId,
      financialTransactionId: finId,
      localLancamentoId: localId,
      craftMeta: {
        fase: '3A',
        origem: 'estorno_pendente_lancado',
        client_payment_id: pendente.clientPaymentId,
        local_lancamento_id: pendente.localLancamentoId,
        ordem_servico_id: pendente.ordemServicoId,
        sale_movement_id: pendente.saleMovementId,
        sale_session_id: pendente.saleSessionId,
        refund_pending_audit_id: pendente.audit.id,
      },
    })

    let movimento = criado.ok ? criado.dados : undefined

    if (!criado.ok) {
      if (ehUniqueRefundViolation(criado.erro)) {
        const deNovo = await buscarRefundAtivoPorPagamentoRemoto(officeId, {
          serviceOrderPaymentId: sopId,
          clientPaymentId: pendente.clientPaymentId,
          localLancamentoId: pendente.localLancamentoId,
        })
        const porAudit = await buscarRefundAtivoPorAuditPendenteRemoto(
          officeId,
          pendente.audit.id
        )
        movimento = (deNovo.ok && deNovo.dados) || (porAudit.ok && porAudit.dados) || undefined
        if (movimento) {
          await registrarAuditoriaCaixa({
            officeId,
            cashSessionId: aberto.dados.id,
            action: 'refund_pending_resolved',
            actorId: params.createdBy,
            actorName: params.createdByName,
            payload: {
              refund_pending_audit_id: pendente.audit.id,
              refund_movement_id: movimento.id,
              service_order_payment_id: sopId,
              amount: pendente.amount,
              os_label: osLabel,
              ordem_servico_id: pendente.ordemServicoId,
              cash_session_id: aberto.dados.id,
              ja_existia: true,
            },
          })
          return { status: 'refund_ja_existia', movimento }
        }
      }
      return { status: 'erro', erro: criado.erro ?? 'Não foi possível lançar o estorno.' }
    }

    if (!movimento) {
      return { status: 'erro', erro: 'Não foi possível lançar o estorno.' }
    }

    await registrarAuditoriaCaixa({
      officeId,
      cashSessionId: aberto.dados.id,
      action: 'refund_pending_resolved',
      actorId: params.createdBy,
      actorName: params.createdByName,
      payload: {
        refund_pending_audit_id: pendente.audit.id,
        refund_movement_id: movimento.id,
        service_order_payment_id: sopId,
        amount: pendente.amount,
        os_label: osLabel,
        ordem_servico_id: pendente.ordemServicoId,
        cash_session_id: aberto.dados.id,
      },
    })

    return { status: 'refund_criado', movimento }
  } catch (err) {
    return {
      status: 'erro',
      erro: err instanceof Error ? err.message : String(err),
    }
  }
}
