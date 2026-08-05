/**
 * RC2 Venda Balcão — receber pagamento + sincronizar financeiro/caixa.
 * Não baixa estoque. Não altera itens. Não duplica receita.
 */
import type { AuthUser } from '@/types/auth'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { LancamentoFinanceiro, LancamentoFinanceiroInput } from '@/types/financeiro'
import type { VendaBalcao, VendaBalcaoFormaPagamento } from '@/types/venda-balcao'
import { atualizarVendaBalcao } from '@/services/venda-balcao/venda-balcao.service'
import { garantirReceitaVendaBalcao } from '@/services/venda-balcao/venda-balcao-financeiro.service'
import { registrarVendaBalcaoNoCaixaSeAplicavel } from '@/services/venda-balcao/venda-balcao-caixa.service'
import {
  chavePagamentoVendaBalcao,
  formaBalcaoParaFinanceiro,
  montarCraftMetaParcelamento,
  obterParcelasCraftMetaVenda,
} from '@/services/venda-balcao/venda-balcao-forma.helpers'
import { stampUpdate } from '@/services/migration.service'
import {
  avaliarExigenciaCaixaParaPagamento,
  registrarAuditoriaPagamentoSemCaixa,
} from '@/services/caixa/pagamento-exige-caixa.service'
import {
  VendaBalcaoSaveError,
  logErroVendaBalcao,
} from '@/services/venda-balcao/venda-balcao-errors'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { MSG } from '@/lib/mensagens-usuario'
import {
  atualizarContagemPendenciasAtivas,
  emitirEventoPersistencia,
} from '@/services/persistence-status.events'
import { persistirLancamentoGeralPagoNoSupabase } from '@/services/financeiro/persistir-lancamento-geral.service'
import { hybridCraftRepository } from '@/services/repository/hybrid.repository'
import { localCraftRepository } from '@/services/repository/local.repository'
import {
  limparLancamentosRecentes,
  marcarPularPersistenciaRemotaProxima,
} from '@/services/supabase-sync/persistencia-opcoes'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import { obterClientPaymentId } from '@/services/pagamentos/payment-dedupe.helpers'

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

type StatusFinanceiroVb = 'criado' | 'atualizado' | 'ja_existia' | 'ignorado'

/** Garante o lançamento no localStorage (evita sumir de Receitas após receber). */
function upsertLancamentoVbLocal(
  officeId: string,
  lancamento: LancamentoFinanceiro
): LancamentoFinanceiro {
  const base = localCraftRepository.carregar(officeId)
  const chave = obterClientPaymentId(lancamento) || chavePagamentoVendaBalcao(lancamento.id)
  const idx = base.lancamentos.findIndex(
    (l) =>
      l.id === lancamento.id ||
      l.client_payment_id === chave ||
      l.id === chave
  )

  const idFinal = idx >= 0 ? base.lancamentos[idx].id : lancamento.id
  const salvo = stampUpdate({
    ...((idx >= 0 ? base.lancamentos[idx] : {}) as LancamentoFinanceiro),
    ...lancamento,
    id: idFinal,
    client_payment_id: chave,
    cancelado: false,
    sync_arquivado: false,
    sync_orfao: false,
    sync_orfao_motivo: undefined,
  })

  const listaFinal =
    idx >= 0
      ? base.lancamentos.map((l, i) => (i === idx ? salvo : l))
      : [...base.lancamentos, salvo]

  marcarPularPersistenciaRemotaProxima()
  localCraftRepository.salvar(officeId, { ...base, lancamentos: listaFinal })
  return salvo
}

async function limparSyncAposReceitaVbOk(
  officeId: string,
  lancamento: LancamentoFinanceiro
): Promise<LancamentoFinanceiro> {
  // Upsert local ANTES do remoto — Receitas lê CraftContext/localStorage.
  let final = upsertLancamentoVbLocal(officeId, {
    ...lancamento,
    sync_pendente: true,
  })

  limparLancamentosRecentes([final.id, obterClientPaymentId(final)])
  hybridCraftRepository.cancelarPersistenciaRemotaAgendada(officeId)
  syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', final.id)

  if (getCraftPersistenceMode() === 'supabase') {
    const remoto = await persistirLancamentoGeralPagoNoSupabase(officeId, {
      ...final,
      sync_pendente: true,
    })
    if (remoto.ok && remoto.financial_id) {
      final = upsertLancamentoVbLocal(officeId, {
        ...final,
        pago: Boolean(lancamento.pago),
        sync_pendente: false,
        payment_supabase_id: remoto.financial_id,
      })
    } else {
      syncQueueService.enfileirar({
        office_id: officeId,
        tipo_acao: 'update',
        entidade: 'lancamento',
        entidade_id: final.id,
      })
      atualizarContagemPendenciasAtivas(officeId)
      emitirEventoPersistencia({
        type: 'pagamentos_pendentes',
        mensagem: MSG.atencaoSync,
        pendentes: 1,
      })
      return { ...final, sync_pendente: true }
    }
  } else {
    final = upsertLancamentoVbLocal(officeId, {
      ...final,
      sync_pendente: false,
    })
  }

  syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', final.id)
  atualizarContagemPendenciasAtivas(officeId)
  emitirEventoPersistencia({
    type: 'pagamento_ok',
    mensagem: MSG.pagamentoRegistrado,
  })
  emitirEventoPersistencia({ type: 'supabase_ok' })
  return final
}

export async function sincronizarFinanceiroCaixaVendaBalcao(params: {
  officeId: string
  venda: VendaBalcao
  forma: VendaBalcaoFormaPagamento | string
  pago?: boolean
  parcelas?: number | null
  lancamentos: LancamentoFinanceiro[]
  adicionarLancamento: (input: LancamentoFinanceiroInput) => LancamentoFinanceiro
  atualizarLancamento: (id: string, patch: Partial<LancamentoFinanceiro>) => void
  user?: AuthUser | null
  observacao?: string
  motivoSemCaixa?: string
}): Promise<{
  financeiro: StatusFinanceiroVb
  caixa: 'registrado' | 'ja_existia' | 'sem_caixa' | 'ignorado' | 'erro'
  venda: VendaBalcao
  avisoCaixa?: string
  lancamento?: LancamentoFinanceiro
}> {
  const pago =
    params.pago ??
    (params.venda.payment_status === 'paid' || params.venda.status === 'paid')

  const parcelas =
    params.parcelas ??
    obterParcelasCraftMetaVenda(params.venda) ??
    undefined

  // Snapshot fresco — evita não achar receita pendente por state React stale.
  const lancamentosAtuais = localCraftRepository.carregar(params.officeId).lancamentos

  const fin = garantirReceitaVendaBalcao({
    officeId: params.officeId,
    venda: params.venda,
    forma: params.forma,
    pago,
    parcelas,
    lancamentos: lancamentosAtuais.length > 0 ? lancamentosAtuais : params.lancamentos,
    adicionarLancamento: params.adicionarLancamento,
    atualizarLancamento: params.atualizarLancamento,
    usuario: params.user
      ? { id: params.user.id, nome: params.user.nome }
      : undefined,
    observacao: params.observacao,
  })

  let lancamento = fin.lancamento
  if (lancamento) {
    // Fonte da verdade: localStorage (não depende do setState do React).
    lancamento = upsertLancamentoVbLocal(params.officeId, {
      ...lancamento,
      oficina_id: params.officeId,
      office_id: params.officeId,
      tipo: 'receita',
      pago: Boolean(pago),
      parcelas: lancamento.parcelas,
      craft_meta: {
        ...(lancamento.craft_meta ?? {}),
        origin_type: 'counter_sale',
        origin_id: params.venda.id,
        counter_sale_id: params.venda.id,
      },
    })
    console.info('[Financeiro][VB][receita-upsert]', {
      saleId: params.venda.id,
      client_payment_id: lancamento.client_payment_id,
      pago: lancamento.pago,
      tipo: lancamento.tipo,
      valor: lancamento.valor,
      craft_meta: lancamento.craft_meta,
      resultado_local: fin.status,
    })
    lancamento = await limparSyncAposReceitaVbOk(params.officeId, lancamento)
    console.info('[Financeiro][VB][receita-upsert]', {
      saleId: params.venda.id,
      client_payment_id: lancamento.client_payment_id,
      pago: lancamento.pago,
      tipo: lancamento.tipo,
      valor: lancamento.valor,
      sync_pendente: lancamento.sync_pendente,
      payment_supabase_id: lancamento.payment_supabase_id,
      resultado_supabase: lancamento.sync_pendente ? 'pendente' : 'ok',
    })
  } else {
    console.warn('[Financeiro][VB][receita-upsert] sem lançamento', {
      saleId: params.venda.id,
      status: fin.status,
      pago,
    })
  }

  let caixaStatus: 'registrado' | 'ja_existia' | 'sem_caixa' | 'ignorado' | 'erro' =
    'ignorado'
  let avisoCaixa: string | undefined

  if (lancamento && pago) {
    const caixa = await registrarVendaBalcaoNoCaixaSeAplicavel({
      officeId: params.officeId,
      venda: params.venda,
      lancamento,
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
          localLancamentoId: lancamento.client_payment_id ?? lancamento.id,
        })
      }
    } else if (caixa.status === 'erro') {
      avisoCaixa =
        'Receita registrada, mas o caixa não pôde ser atualizado. Use “Sincronizar financeiro/caixa” depois.'
    }
  }

  const craftMeta = montarCraftMetaParcelamento({
    forma: params.forma,
    parcelas,
    metaAtual: {
      ...params.venda.craft_meta,
      financeiro_lancado: fin.status !== 'ignorado',
      financeiro_status: fin.status,
      caixa_registrado: caixaStatus === 'registrado' || caixaStatus === 'ja_existia',
      caixa_status: caixaStatus,
      financeiro_sync_at: new Date().toISOString(),
    },
  })

  const vendaAtualizada = await atualizarVendaBalcao(params.officeId, params.venda.id, {
    craft_meta: craftMeta,
  })

  return {
    financeiro: fin.status,
    caixa: caixaStatus,
    venda: vendaAtualizada,
    avisoCaixa,
    lancamento,
  }
}

/**
 * Recebe pagamento total de venda pendente.
 * Atualiza a receita existente para Pago — não cria segunda.
 * Não baixa estoque. Não altera itens.
 */
export async function receberPagamentoVendaBalcao(params: {
  officeId: string
  venda: VendaBalcao
  forma: VendaBalcaoFormaPagamento
  parcelas?: number | null
  observacao?: string
  lancamentos: LancamentoFinanceiro[]
  adicionarLancamento: (input: LancamentoFinanceiroInput) => LancamentoFinanceiro
  atualizarLancamento: (id: string, patch: Partial<LancamentoFinanceiro>) => void
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
    const recebimentoMeta = montarCraftMetaParcelamento({
      forma: params.forma,
      parcelas: params.parcelas,
      metaAtual: {
        ...params.venda.craft_meta,
        received_at: new Date().toISOString(),
        received_by: params.user.id,
        received_by_name: params.user.nome,
        received_method: params.forma,
        receive_note: params.observacao?.trim() || undefined,
      },
    })

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
      pago: true,
      parcelas: params.parcelas,
      lancamentos: params.lancamentos,
      adicionarLancamento: params.adicionarLancamento,
      atualizarLancamento: params.atualizarLancamento,
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
  atualizarLancamento: (id: string, patch: Partial<LancamentoFinanceiro>) => void
  user?: AuthUser | null
}): Promise<{
  financeiro: StatusFinanceiroVb
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
    pago: true,
    lancamentos: params.lancamentos,
    adicionarLancamento: params.adicionarLancamento,
    atualizarLancamento: params.atualizarLancamento,
    user: params.user,
  })
}
