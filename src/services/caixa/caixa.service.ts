/**
 * Service de Caixa — Fase 1A (abrir/fechar) + Fase 2A (movimentos).
 *
 * Fase 2A:
 * - listar / criar / cancelar (soft delete) movimentos
 * - calcular resumo (saldo esperado) a partir dos movimentos ativos
 * - NÃO atualiza cash_sessions.expected_balance automaticamente
 * - NÃO vincula pagamento de OS no fluxo
 *
 * Recurso de plano `caixa_avancado` existe no catálogo, mas NÃO bloqueia nesta fase.
 */

import {
  abrirCaixaRemoto,
  cancelarMovimentoCaixaRemoto,
  criarMovimentoCaixaRemoto,
  fecharCaixaRemoto,
  listarAuditoriaCaixaRemoto,
  listarMovimentosCaixaRemoto,
  listarSessoesCaixaRemoto,
  obterCaixaAbertoRemoto,
  obterSessaoCaixaRemoto,
} from '@/services/caixa/supabase-caixa.persistence'
import type {
  AbrirCaixaParams,
  AuditoriaCaixa,
  CancelarMovimentoCaixaParams,
  CriarMovimentoCaixaParams,
  FecharCaixaParams,
  ListarSessoesCaixaFiltros,
  MovimentoCaixa,
  ResumoCaixa,
  ResultadoCaixa,
  SessaoCaixa,
} from '@/types/caixa'

function arred2(n: number): number {
  return Number(n.toFixed(2))
}

/**
 * Calcula o resumo financeiro da sessão a partir dos movimentos ativos.
 * Formula:
 * saldoEsperado = opening
 *   + entradas (manual_in) + suprimentos + vendas (sale)
 *   - saídas (manual_out) - sangrias - estornos (refund)
 */
export function calcularResumoCaixaLocal(
  sessao: Pick<SessaoCaixa, 'id' | 'opening_balance'>,
  movimentos: MovimentoCaixa[]
): ResumoCaixa {
  const ativos = movimentos.filter((m) => !m.deleted_at)
  let totalEntradas = 0
  let totalSaidas = 0
  let totalSangrias = 0
  let totalSuprimentos = 0
  let totalVendas = 0
  let totalEstornos = 0

  for (const m of ativos) {
    const v = Number(m.amount)
    if (!Number.isFinite(v) || v <= 0) continue
    switch (m.type) {
      case 'manual_in':
        totalEntradas += v
        break
      case 'manual_out':
        totalSaidas += v
        break
      case 'sangria':
        totalSangrias += v
        break
      case 'suprimento':
        totalSuprimentos += v
        break
      case 'sale':
        totalVendas += v
        break
      case 'refund':
        totalEstornos += v
        break
      default:
        break
    }
  }

  const opening = Number(sessao.opening_balance) || 0
  const saldoEsperado =
    opening +
    totalEntradas +
    totalSuprimentos +
    totalVendas -
    totalSaidas -
    totalSangrias -
    totalEstornos

  return {
    cash_session_id: sessao.id,
    opening_balance: arred2(opening),
    totalEntradas: arred2(totalEntradas),
    totalSaidas: arred2(totalSaidas),
    totalSangrias: arred2(totalSangrias),
    totalSuprimentos: arred2(totalSuprimentos),
    totalVendas: arred2(totalVendas),
    totalEstornos: arred2(totalEstornos),
    saldoEsperado: arred2(saldoEsperado),
    quantidadeMovimentos: ativos.length,
  }
}

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
 * - expected_balance = cálculo com movimentos ativos (Fase 2B)
 * - difference = closing_balance_informed - expected_balance
 * - Persiste expected_balance/difference na sessão ao fechar
 * - Registra audit log
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

/** Lista movimentos ativos da sessão (deleted_at IS NULL). */
export async function listarMovimentosCaixa(
  officeId: string,
  cashSessionId: string
): Promise<ResultadoCaixa<MovimentoCaixa[]>> {
  return listarMovimentosCaixaRemoto(officeId, cashSessionId)
}

/**
 * Cria movimento na sessão aberta.
 * Tipos: manual_in | manual_out | sangria | suprimento | sale | refund
 * Não atualiza expected_balance persistido da sessão.
 */
export async function criarMovimentoCaixa(
  params: CriarMovimentoCaixaParams
): Promise<ResultadoCaixa<MovimentoCaixa>> {
  return criarMovimentoCaixaRemoto(params)
}

/** Soft delete do movimento + audit log. */
export async function cancelarMovimentoCaixa(
  params: CancelarMovimentoCaixaParams
): Promise<ResultadoCaixa<MovimentoCaixa>> {
  return cancelarMovimentoCaixaRemoto(params)
}

/**
 * Calcula resumo da sessão (saldo esperado com movimentos).
 * Não grava em cash_sessions — só leitura/cálculo.
 */
export async function calcularResumoCaixa(
  officeId: string,
  cashSessionId: string
): Promise<ResultadoCaixa<ResumoCaixa>> {
  const [sessao, movimentos] = await Promise.all([
    obterSessaoCaixaRemoto(officeId, cashSessionId),
    listarMovimentosCaixaRemoto(officeId, cashSessionId),
  ])
  if (!sessao.ok || !sessao.dados) {
    return { ok: false, erro: sessao.erro ?? 'Sessão de caixa não encontrada.' }
  }
  if (!movimentos.ok) {
    return { ok: false, erro: movimentos.erro }
  }
  return {
    ok: true,
    dados: calcularResumoCaixaLocal(sessao.dados, movimentos.dados ?? []),
  }
}
