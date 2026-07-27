/**
 * Fase 3B1 — gate "exigir caixa aberto para pagamentos".
 * Não cria caixa automático. Não bloqueia pagamento pendente/a receber.
 */

import { MSG } from '@/lib/mensagens-usuario'
import {
  podeRegistrarPagamentoSemCaixaComMotivo,
} from '@/services/auth/permissions'
import { obterCaixaAberto, registrarAuditoriaCaixa } from '@/services/caixa/caixa.service'
import { obterCaixaConfig } from '@/types/caixa-config'
import type { AuthUser } from '@/types/auth'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { FormaPagamento } from '@/types/enums'

export type ResultadoExigenciaCaixaPagamento =
  | { status: 'ok' }
  | { status: 'bloquear'; mensagem: string }
  | { status: 'pedir_motivo' }

export function pagamentoExigeCaixaAberto(params: {
  formaPagamento: FormaPagamento | string
  pago?: boolean
}): boolean {
  if (params.pago === false) return false
  if (params.formaPagamento === 'fiado') return false
  return true
}

export async function avaliarExigenciaCaixaParaPagamento(params: {
  officeId: string
  configuracao?: ConfiguracaoOficina | null
  user: AuthUser | null | undefined
  formaPagamento: FormaPagamento | string
  pago?: boolean
}): Promise<ResultadoExigenciaCaixaPagamento> {
  if (!pagamentoExigeCaixaAberto(params)) {
    return { status: 'ok' }
  }

  const cfg = obterCaixaConfig(params.configuracao)
  if (!cfg.exigir_caixa_aberto_pagamentos) {
    return { status: 'ok' }
  }

  const aberto = await obterCaixaAberto(params.officeId)
  if (aberto.ok && aberto.dados?.status === 'open') {
    return { status: 'ok' }
  }

  if (podeRegistrarPagamentoSemCaixaComMotivo(params.user, params.configuracao)) {
    return { status: 'pedir_motivo' }
  }

  return {
    status: 'bloquear',
    mensagem: MSG.abraCaixaAntesDeRegistrarPagamentos,
  }
}

/** Auditoria best-effort — falha não deve quebrar o pagamento. */
export async function registrarAuditoriaPagamentoSemCaixa(params: {
  officeId: string
  user?: AuthUser | null
  ordemServicoId?: string | null
  numeroOs?: number | null
  valor: number
  formaPagamento: string
  motivo: string
  localLancamentoId?: string | null
}): Promise<void> {
  try {
    const r = await registrarAuditoriaCaixa({
      officeId: params.officeId,
      cashSessionId: null,
      action: 'payment_without_open_cash_authorized',
      actorId: params.user?.id,
      actorName: params.user?.nome,
      payload: {
        ordem_servico_id: params.ordemServicoId ?? null,
        numero_os: params.numeroOs ?? null,
        amount: params.valor,
        payment_method: params.formaPagamento,
        reason: params.motivo.trim(),
        local_lancamento_id: params.localLancamentoId ?? null,
        authorized_at: new Date().toISOString(),
      },
    })
    if (!r.ok) {
      console.warn('[BoxGestor Caixa] Auditoria pagamento sem caixa falhou', r.erro)
    }
  } catch (err) {
    console.warn('[BoxGestor Caixa] Exceção na auditoria pagamento sem caixa', err)
  }
}
