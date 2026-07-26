/**
 * Service de Caixa — Fase 1A (abrir / fechar / listar).
 *
 * Escopo desta fase:
 * - Sessões de caixa (open/closed)
 * - Audit log básico
 * - Sem movimentos (cash_movements)
 * - Sem vínculo com pagamento de OS / recibo
 *
 * Recurso de plano `caixa_avancado` existe no catálogo, mas NÃO bloqueia nesta fase.
 */

import {
  abrirCaixaRemoto,
  fecharCaixaRemoto,
  listarAuditoriaCaixaRemoto,
  listarSessoesCaixaRemoto,
  obterCaixaAbertoRemoto,
} from '@/services/caixa/supabase-caixa.persistence'
import type {
  AbrirCaixaParams,
  AuditoriaCaixa,
  FecharCaixaParams,
  ListarSessoesCaixaFiltros,
  ResultadoCaixa,
  SessaoCaixa,
} from '@/types/caixa'

/** Busca a sessão de caixa aberta da oficina (ou null). */
export async function obterCaixaAberto(
  officeId: string
): Promise<ResultadoCaixa<SessaoCaixa | null>> {
  return obterCaixaAbertoRemoto(officeId)
}

/** Lista sessões de caixa (mais recentes primeiro). */
export async function listarSessoesCaixa(
  officeId: string,
  filtros?: ListarSessoesCaixaFiltros
): Promise<ResultadoCaixa<SessaoCaixa[]>> {
  return listarSessoesCaixaRemoto(officeId, filtros)
}

/**
 * Abre um caixa.
 * - Falha se já houver caixa aberto (regra + índice único no banco).
 * - expected_balance = opening_balance (sem movimentos ainda).
 * - Registra audit log.
 */
export async function abrirCaixa(
  params: AbrirCaixaParams
): Promise<ResultadoCaixa<SessaoCaixa>> {
  return abrirCaixaRemoto(params)
}

/**
 * Fecha um caixa aberto.
 * - difference = closing_balance_informed - expected_balance
 * - Na Fase 1A, expected_balance = opening_balance
 * - Registra audit log.
 */
export async function fecharCaixa(
  params: FecharCaixaParams
): Promise<ResultadoCaixa<SessaoCaixa>> {
  return fecharCaixaRemoto(params)
}

/** Lista audit logs do caixa (opcionalmente filtrado por sessão). */
export async function listarAuditoriaCaixa(
  officeId: string,
  cashSessionId?: string,
  limite?: number
): Promise<ResultadoCaixa<AuditoriaCaixa[]>> {
  return listarAuditoriaCaixaRemoto(officeId, cashSessionId, limite)
}
