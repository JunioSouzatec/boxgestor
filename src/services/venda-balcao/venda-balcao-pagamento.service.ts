/**
 * RC2 Venda Balcão A3 — receber pagamento + sincronizar financeiro/caixa.
 * Não baixa estoque. Não altera itens.
 */
import type { AuthUser } from '@/types/auth'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { LancamentoFinanceiro, LancamentoFinanceiroInput } from '@/types/financeiro'
import type { VendaBalcao, VendaBalcaoFormaPagamento } from '@/types/venda-balcao'
import { atualizarVendaBalcao } from '@/services/venda-balcao/venda-balcao.service'
import { garantirReceitaVendaBalcao } from '@/services/venda-balcao/venda-balcao-financeiro.service'
import { registrarVendaBalcaoNoCaixaSeAplicavel } from '@/services/venda-balcao/venda-balcao-caixa.service'
import { formaBalcaoParaFinanceiro } from '@/services/venda-balcao/venda-balcao-forma.helpers'
import {
  avaliarExigenciaCaixaParaPagamento,
  registrarAuditoriaPagamentoSemCaixa,
} from '@/services/caixa/pagamento-exige-caixa.service'
import {
  VendaBalcaoSaveError,
  logErroVendaBalcao,
} from '@/services/venda-balcao/venda-balcao-errors'

const FORMAS_PAGAS: VendaBalcaoFormaPagamento[] = [
  'dinheiro',
  'pix',
  'cartao_debito',
  'cartao_credito',
  'transferencia',
  'outro',
]

export function formasRecebimentoVendaBalcao(): VendaBalcaoFormaPagamento[] {
  return [...FORMAS_PAGAS]
}

export async function sincronizarFinanceiroCaixaVendaBalcao(params: {
  officeId: string
  venda: VendaBalcao
  forma: VendaBalcaoFormaPagamento | string
  lancamentos: LancamentoFinanceiro[]
  adicionarLancamento: (input: LancamentoFinanceiroInput) => LancamentoFinanceiro
  user?: AuthUser | null
  observacao?: string
  motivoSemCaixa?: string
}): Promise<{
  financeiro: 'criado' | 'ja_existia' | 'ignorado'
  caixa: 'registrado' | 'ja_existia' | 'sem_caixa' | 'ignorado' | 'erro'
  venda: VendaBalcao
  avisoCaixa?: string
}> {
  const fin = garantirReceitaVendaBalcao({
    venda: params.venda,
    forma: params.forma,
    lancamentos: params.lancamentos,
    adicionarLancamento: params.adicionarLancamento,
    usuario: params.user
      ? { id: params.user.id, nome: params.user.nome }
      : undefined,
    observacao: params.observacao,
  })

  let caixaStatus: 'registrado' | 'ja_existia' | 'sem_caixa' | 'ignorado' | 'erro' =
    'ignorado'
  let avisoCaixa: string | undefined

  if (fin.lancamento) {
    const caixa = await registrarVendaBalcaoNoCaixaSeAplicavel({
      officeId: params.officeId,
      venda: params.venda,
      lancamento: fin.lancamento,
      createdBy: params.user?.id,
      createdByName: params.user?.nome,
    })
    caixaStatus = caixa.status
    if (caixa.status === 'sem_caixa') {
      avisoCaixa =
        'Receita registrada. Não havia caixa aberto — o valor não entrou no caixa desta vez.'
      if (params.motivoSemCaixa?.trim()) {
        await registrarAuditoriaPagamentoSemCaixa({
          officeId: params.officeId,
          user: params.user,
          valor: Number(params.venda.total) || 0,
          formaPagamento: String(params.forma),
          motivo: params.motivoSemCaixa.trim(),
          localLancamentoId: fin.lancamento.client_payment_id ?? fin.lancamento.id,
        })
      }
    } else if (caixa.status === 'erro') {
      avisoCaixa =
        'Receita registrada, mas o caixa não pôde ser atualizado. Use “Sincronizar financeiro/caixa” depois.'
    }
  }

  const craftMeta = {
    ...params.venda.craft_meta,
    financeiro_lancado: fin.status !== 'ignorado',
    financeiro_status: fin.status,
    caixa_registrado: caixaStatus === 'registrado' || caixaStatus === 'ja_existia',
    caixa_status: caixaStatus,
    financeiro_sync_at: new Date().toISOString(),
  }

  const vendaAtualizada = await atualizarVendaBalcao(params.officeId, params.venda.id, {
    craft_meta: craftMeta,
  })

  return {
    financeiro: fin.status,
    caixa: caixaStatus,
    venda: vendaAtualizada,
    avisoCaixa,
  }
}

/**
 * Recebe pagamento total de venda pendente.
 * Não baixa estoque. Não altera itens.
 */
export async function receberPagamentoVendaBalcao(params: {
  officeId: string
  venda: VendaBalcao
  forma: VendaBalcaoFormaPagamento
  observacao?: string
  lancamentos: LancamentoFinanceiro[]
  adicionarLancamento: (input: LancamentoFinanceiroInput) => LancamentoFinanceiro
  user: AuthUser
  configuracao?: ConfiguracaoOficina | null
  motivoSemCaixa?: string
}): Promise<{
  venda: VendaBalcao
  avisoCaixa?: string
}> {
  if (params.venda.deleted_at) {
    throw new VendaBalcaoSaveError(
      'validacao',
      new Error('Venda excluída'),
      'Não foi possível receber: venda indisponível.'
    )
  }
  if (params.venda.payment_status === 'paid' || params.venda.status === 'paid') {
    throw new VendaBalcaoSaveError(
      'validacao',
      new Error('Já paga'),
      'Esta venda já está marcada como paga.'
    )
  }
  if (params.venda.payment_status === 'canceled' || params.venda.status === 'canceled') {
    throw new VendaBalcaoSaveError(
      'validacao',
      new Error('Cancelada'),
      'Não é possível receber uma venda cancelada.'
    )
  }
  if (!formaBalcaoParaFinanceiro(params.forma)) {
    throw new VendaBalcaoSaveError(
      'validacao',
      new Error('Forma inválida'),
      'Escolha uma forma de pagamento válida (não use Pendente).'
    )
  }

  const total = Number(params.venda.total) || 0
  if (!(total > 0)) {
    throw new VendaBalcaoSaveError(
      'validacao',
      new Error('Total inválido'),
      'Total da venda inválido.'
    )
  }

  const formaFin = formaBalcaoParaFinanceiro(params.forma)!
  const exigencia = await avaliarExigenciaCaixaParaPagamento({
    officeId: params.officeId,
    configuracao: params.configuracao,
    user: params.user,
    formaPagamento: formaFin,
    pago: true,
  })
  if (exigencia.status === 'bloquear') {
    throw new VendaBalcaoSaveError(
      'validacao',
      new Error(exigencia.mensagem),
      exigencia.mensagem
    )
  }
  if (exigencia.status === 'pedir_motivo' && !params.motivoSemCaixa?.trim()) {
    throw new VendaBalcaoSaveError(
      'validacao',
      new Error('motivo_caixa'),
      'Informe o motivo para receber sem caixa aberto.'
    )
  }

  try {
    const recebimentoMeta = {
      ...params.venda.craft_meta,
      received_at: new Date().toISOString(),
      received_by: params.user.id,
      received_by_name: params.user.nome,
      received_method: params.forma,
      receive_note: params.observacao?.trim() || undefined,
    }

    const vendaPaga = await atualizarVendaBalcao(params.officeId, params.venda.id, {
      status: 'paid',
      payment_status: 'paid',
      payment_method: params.forma,
      paid_amount: total,
      pending_amount: 0,
      craft_meta: recebimentoMeta,
    })

    const sync = await sincronizarFinanceiroCaixaVendaBalcao({
      officeId: params.officeId,
      venda: vendaPaga,
      forma: params.forma,
      lancamentos: params.lancamentos,
      adicionarLancamento: params.adicionarLancamento,
      user: params.user,
      observacao: params.observacao,
      motivoSemCaixa: params.motivoSemCaixa,
    })

    return { venda: sync.venda, avisoCaixa: sync.avisoCaixa }
  } catch (e) {
    logErroVendaBalcao({
      etapa: 'desconhecida',
      erro: e,
      payload: { sale_id: params.venda.id, etapa: 'receber_pagamento' },
    })
    if (e instanceof VendaBalcaoSaveError) throw e
    throw new VendaBalcaoSaveError(
      'desconhecida',
      e,
      'Não foi possível registrar o recebimento. Tente novamente.'
    )
  }
}

/** Sincroniza fin/caixa de venda já paga (ex.: A2 sem integração). */
export async function sincronizarVendaBalcaoPagaExistente(params: {
  officeId: string
  venda: VendaBalcao
  lancamentos: LancamentoFinanceiro[]
  adicionarLancamento: (input: LancamentoFinanceiroInput) => LancamentoFinanceiro
  user?: AuthUser | null
}): Promise<{
  financeiro: 'criado' | 'ja_existia' | 'ignorado'
  caixa: 'registrado' | 'ja_existia' | 'sem_caixa' | 'ignorado' | 'erro'
  avisoCaixa?: string
  venda: VendaBalcao
}> {
  if (params.venda.payment_status !== 'paid') {
    throw new VendaBalcaoSaveError(
      'validacao',
      new Error('Não paga'),
      'Só é possível sincronizar vendas já pagas.'
    )
  }
  const forma = params.venda.payment_method
  if (!forma || forma === 'pendente') {
    throw new VendaBalcaoSaveError(
      'validacao',
      new Error('Sem forma'),
      'Venda paga sem forma de pagamento válida.'
    )
  }
  return sincronizarFinanceiroCaixaVendaBalcao({
    officeId: params.officeId,
    venda: params.venda,
    forma,
    lancamentos: params.lancamentos,
    adicionarLancamento: params.adicionarLancamento,
    user: params.user,
  })
}
