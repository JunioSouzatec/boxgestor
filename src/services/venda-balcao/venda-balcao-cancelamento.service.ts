/**
 * RC2 Venda Balcão B — cancelamento seguro com estorno controlado.
 * Sem emissão fiscal. Sem exclusão física. Idempotente.
 */
import type { AuthUser } from '@/types/auth'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { VendaBalcao } from '@/types/venda-balcao'
import { atualizarVendaBalcao, obterVendaBalcaoPorId } from '@/services/venda-balcao/venda-balcao.service'
import {
  cancelarReceitasVendaBalcao,
  encontrarLancamentoVendaBalcao,
} from '@/services/venda-balcao/venda-balcao-financeiro.service'
import { estornarVendaCaixaSeAplicavel } from '@/services/caixa/estornar-venda-caixa.service'
import type { StatusEstornoCaixa } from '@/services/caixa/estornar-venda-caixa.service'
import { persistirLancamentoGeralPagoNoSupabase } from '@/services/financeiro/persistir-lancamento-geral.service'
import { localCraftRepository } from '@/services/repository/local.repository'
import { hybridCraftRepository } from '@/services/repository/hybrid.repository'
import { stampUpdate } from '@/services/migration.service'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { MSG } from '@/lib/mensagens-usuario'
import {
  VendaBalcaoSaveError,
  logErroVendaBalcao,
} from '@/services/venda-balcao/venda-balcao-errors'
import { chavePagamentoVendaBalcao } from '@/services/venda-balcao/venda-balcao-forma.helpers'
import {
  atualizarContagemPendenciasAtivas,
  emitirEventoPersistencia,
} from '@/services/persistence-status.events'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import { obterClientPaymentId } from '@/services/pagamentos/payment-dedupe.helpers'
import {
  limparLancamentosRecentes,
  marcarPularPersistenciaRemotaProxima,
} from '@/services/supabase-sync/persistencia-opcoes'

const ETAPA = 'venda_balcao_cancelamento_b'

export type StatusCancelamentoVendaBalcao =
  | 'cancelada'
  | 'ja_cancelada'
  | 'erro'

export interface ResultadoCancelamentoVendaBalcao {
  status: StatusCancelamentoVendaBalcao
  venda: VendaBalcao
  estoque: {
    estornado: boolean
    ja_estornado: boolean
    itens: Array<{
      peca_id: string
      quantity: number
      ja_estornado: boolean
      movimento_id: string
    }>
    erro?: string
  }
  financeiro: {
    status: 'cancelado' | 'ja_cancelado' | 'sem_lancamento' | 'ignorado'
    ids: string[]
  }
  caixa: {
    status: StatusEstornoCaixa | 'ignorado'
    aviso?: string
    movimento_id?: string
  }
  avisoFiscalRascunho?: string
}

function upsertLancamentoCanceladoLocal(
  officeId: string,
  lancamento: LancamentoFinanceiro
): LancamentoFinanceiro {
  const base = localCraftRepository.carregar(officeId)
  const chave = obterClientPaymentId(lancamento) || chavePagamentoVendaBalcao(lancamento.id)
  const idx = base.lancamentos.findIndex(
    (l) => l.id === lancamento.id || l.client_payment_id === chave || l.id === chave
  )
  const idFinal = idx >= 0 ? base.lancamentos[idx].id : lancamento.id
  const salvo = stampUpdate({
    ...((idx >= 0 ? base.lancamentos[idx] : {}) as LancamentoFinanceiro),
    ...lancamento,
    id: idFinal,
    client_payment_id: chave,
    cancelado: true,
    pago: false,
    sync_arquivado: true,
  })
  const listaFinal =
    idx >= 0
      ? base.lancamentos.map((l, i) => (i === idx ? salvo : l))
      : [...base.lancamentos, salvo]
  // Evita hybrid reprocessar e emitir pagamentos_pendentes fantasma.
  marcarPularPersistenciaRemotaProxima()
  localCraftRepository.salvar(officeId, { ...base, lancamentos: listaFinal })
  return salvo
}

/** Limpa indicadores locais após cancelamento bem-sucedido (não esconde pendência real). */
function limparIndicadoresSyncAposCancelamento(
  officeId: string,
  lancamentoIds: string[],
  opts?: { houveFalhaFinanceiro?: boolean; falhaIds?: string[] }
): void {
  const okIds = lancamentoIds.filter((id) => !(opts?.falhaIds ?? []).includes(id))
  limparLancamentosRecentes(lancamentoIds)
  hybridCraftRepository.cancelarPersistenciaRemotaAgendada(officeId)

  for (const id of okIds) {
    syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', id)
  }

  // Garante sync_pendente=false nos cancelados que sincronizaram.
  if (okIds.length > 0) {
    const base = localCraftRepository.carregar(officeId)
    const okSet = new Set(okIds)
    let mudou = false
    const lancamentos = base.lancamentos.map((l) => {
      if (!okSet.has(l.id)) return l
      if (!l.cancelado && !l.sync_arquivado) return l
      if (l.sync_pendente === false) return l
      mudou = true
      return stampUpdate({ ...l, sync_pendente: false })
    })
    if (mudou) {
      marcarPularPersistenciaRemotaProxima()
      localCraftRepository.salvar(officeId, { ...base, lancamentos })
    }
  }

  const contagem = atualizarContagemPendenciasAtivas(officeId)

  if (opts?.houveFalhaFinanceiro && (opts.falhaIds?.length ?? 0) > 0) {
    for (const id of opts.falhaIds!) {
      syncQueueService.enfileirar({
        office_id: officeId,
        tipo_acao: 'update',
        entidade: 'lancamento',
        entidade_id: id,
      })
    }
    atualizarContagemPendenciasAtivas(officeId)
    emitirEventoPersistencia({
      type: 'pagamentos_pendentes',
      mensagem: MSG.atencaoSync,
      pendentes: Math.max(1, opts.falhaIds!.length),
    })
    return
  }

  if (contagem.total === 0) {
    emitirEventoPersistencia({
      type: 'pagamento_ok',
      mensagem: 'Cancelamento sincronizado.',
    })
    emitirEventoPersistencia({ type: 'supabase_ok' })
  } else {
    // Pendência real de outra origem — mantém aviso via contagem.
    emitirEventoPersistencia({
      type: 'pagamentos_pendentes',
      mensagem: MSG.atencaoSync,
      pendentes: contagem.total,
    })
  }
}

async function persistirReceitasCanceladas(
  officeId: string,
  lancamentos: LancamentoFinanceiro[]
): Promise<{ okIds: string[]; falhaIds: string[] }> {
  const okIds: string[] = []
  const falhaIds: string[] = []

  for (const l of lancamentos) {
    const local = upsertLancamentoCanceladoLocal(officeId, {
      ...l,
      cancelado: true,
      pago: false,
      sync_arquivado: true,
      sync_pendente: true,
    })
    if (getCraftPersistenceMode() !== 'supabase') {
      upsertLancamentoCanceladoLocal(officeId, {
        ...local,
        sync_pendente: false,
      })
      okIds.push(local.id)
      continue
    }
    try {
      const remoto = await persistirLancamentoGeralPagoNoSupabase(officeId, local)
      if (remoto.ok) {
        upsertLancamentoCanceladoLocal(officeId, {
          ...local,
          sync_pendente: false,
          payment_supabase_id: remoto.financial_id ?? local.payment_supabase_id,
        })
        syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', local.id)
        okIds.push(local.id)
      } else {
        falhaIds.push(local.id)
      }
    } catch (e) {
      console.warn('[VendaBalcao][cancelamento] persistir receita cancelada falhou', e)
      falhaIds.push(local.id)
    }
  }

  return { okIds, falhaIds }
}

function itensParaEstorno(venda: VendaBalcao) {
  return (venda.itens ?? [])
    .filter((i) => !i.deleted_at && (Number(i.quantity) || 0) > 0)
    .map((i) => ({
      peca_id: i.inventory_local_id || i.inventory_item_id || '',
      peca_nome: i.item_name,
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      sale_item_id: i.id,
    }))
    .filter((i) => Boolean(i.peca_id))
}

/**
 * Cancela venda balcão com estorno de estoque / financeiro / caixa.
 * Não emite nem cancela nota fiscal real.
 */
export async function cancelarVendaBalcao(params: {
  officeId: string
  vendaId: string
  motivo: string
  user: AuthUser
  lancamentos: LancamentoFinanceiro[]
  atualizarLancamento: (id: string, patch: Partial<LancamentoFinanceiro>) => void
  estornarEstoque: (args: {
    saleId: string
    saleNumber?: number
    itens: Array<{
      peca_id: string
      peca_nome: string
      quantity: number
      unit_price: number
      sale_item_id?: string
    }>
  }) => Promise<{
    ok: boolean
    jaCompleta: boolean
    itens: Array<{
      peca_id: string
      peca_nome: string
      quantity: number
      stock_before: number
      stock_after: number
      ja_estornado: boolean
      movimento_id: string
    }>
    erro?: string
  }>
}): Promise<ResultadoCancelamentoVendaBalcao> {
  const motivo = params.motivo.trim()
  if (!motivo) {
    throw new VendaBalcaoSaveError(
      'validacao',
      new Error('motivo_obrigatorio'),
      'Informe o motivo do cancelamento.'
    )
  }

  const vendaAtual =
    (await obterVendaBalcaoPorId(params.officeId, params.vendaId, true)) ?? null
  if (!vendaAtual || vendaAtual.deleted_at) {
    throw new VendaBalcaoSaveError(
      'validacao',
      new Error('venda_indisponivel'),
      'Venda não encontrada ou indisponível.'
    )
  }

  if (vendaAtual.status === 'canceled' || vendaAtual.payment_status === 'canceled') {
    limparIndicadoresSyncAposCancelamento(params.officeId, [])
    return {
      status: 'ja_cancelada',
      venda: vendaAtual,
      estoque: {
        estornado: Boolean(vendaAtual.craft_meta?.estorno_estoque),
        ja_estornado: true,
        itens: [],
      },
      financeiro: {
        status: 'ja_cancelado',
        ids: [],
      },
      caixa: { status: 'ignorado' },
      avisoFiscalRascunho:
        'Esta venda foi cancelada. Revise ou exclua o rascunho fiscal relacionado, se houver.',
    }
  }

  const eraPaga =
    vendaAtual.payment_status === 'paid' || vendaAtual.status === 'paid'
  const agora = new Date().toISOString()

  // Evita timer hybrid do estorno de estoque emitir aviso fantasma de pagamento.
  hybridCraftRepository.cancelarPersistenciaRemotaAgendada(params.officeId)
  marcarPularPersistenciaRemotaProxima()

  // 1) Estoque — devolve se baixa existiu (pago ou pendente).
  let estoqueResult: ResultadoCancelamentoVendaBalcao['estoque'] = {
    estornado: false,
    ja_estornado: Boolean(vendaAtual.craft_meta?.estorno_estoque),
    itens: [],
  }

  const precisaEstoque =
    vendaAtual.craft_meta?.stock_baixado === true ||
    itensParaEstorno(vendaAtual).length > 0

  if (precisaEstoque && !vendaAtual.craft_meta?.estorno_estoque) {
    const itens = itensParaEstorno(vendaAtual)
    if (itens.length > 0) {
      const res = await params.estornarEstoque({
        saleId: vendaAtual.id,
        saleNumber: vendaAtual.sale_number,
        itens,
      })
      if (!res.ok) {
        throw new VendaBalcaoSaveError(
          'desconhecida',
          new Error(res.erro || 'Falha no estorno de estoque'),
          res.erro || 'Não foi possível devolver o estoque. Cancelamento abortado.'
        )
      }
      estoqueResult = {
        estornado: !res.jaCompleta,
        ja_estornado: res.jaCompleta,
        itens: res.itens.map((i) => ({
          peca_id: i.peca_id,
          quantity: i.quantity,
          ja_estornado: i.ja_estornado,
          movimento_id: i.movimento_id,
        })),
        erro: res.erro,
      }
      // Estorno grava via CraftContext/hybrid — cancela push automático de pagamentos.
      hybridCraftRepository.cancelarPersistenciaRemotaAgendada(params.officeId)
      marcarPularPersistenciaRemotaProxima()
    }
  } else if (vendaAtual.craft_meta?.estorno_estoque) {
    estoqueResult = {
      estornado: false,
      ja_estornado: true,
      itens: [],
    }
  }

  // 2) Financeiro — cancela receita (paga ou pendente a receber).
  // Persistência local direta + espelho React com pular remoto (evita race e aviso fantasma).
  const lancamentosAtuais = localCraftRepository.carregar(params.officeId).lancamentos
  const fin = cancelarReceitasVendaBalcao({
    saleId: vendaAtual.id,
    lancamentos: lancamentosAtuais.length > 0 ? lancamentosAtuais : params.lancamentos,
    atualizarLancamento: (id, patch) => {
      const base = localCraftRepository.carregar(params.officeId)
      const atual = base.lancamentos.find((l) => l.id === id)
      if (!atual) return
      upsertLancamentoCanceladoLocal(params.officeId, {
        ...atual,
        ...patch,
        cancelado: true,
        pago: false,
        sync_arquivado: true,
      })
      try {
        marcarPularPersistenciaRemotaProxima()
        params.atualizarLancamento(id, {
          ...patch,
          cancelado: true,
          pago: false,
          sync_arquivado: true,
          sync_pendente: patch.sync_pendente ?? false,
        })
      } catch (e) {
        console.warn('[VendaBalcao][cancelamento] espelho React falhou', e)
      }
    },
    motivo: `Cancelamento venda balcão: ${motivo}`,
  })

  let falhaFinanceiroIds: string[] = []
  if (fin.lancamentos.length > 0) {
    const persistido = await persistirReceitasCanceladas(params.officeId, fin.lancamentos)
    falhaFinanceiroIds = persistido.falhaIds
  }

  // 3) Caixa — só se era paga (pode ter sale).
  let caixaStatus: StatusEstornoCaixa | 'ignorado' = 'ignorado'
  let caixaAviso: string | undefined
  let caixaMovimentoId: string | undefined

  if (eraPaga) {
    const principal =
      fin.lancamentos[0] ||
      encontrarLancamentoVendaBalcao(
        localCraftRepository.carregar(params.officeId).lancamentos,
        vendaAtual.id
      )
    if (principal) {
      const label =
        vendaAtual.sale_number != null
          ? `Venda balcão #${vendaAtual.sale_number}`
          : `Venda balcão ${vendaAtual.id.slice(0, 8)}`
      const caixa = await estornarVendaCaixaSeAplicavel({
        officeId: params.officeId,
        lancamento: { ...principal, pago: true, cancelado: false },
        createdBy: params.user.id,
        createdByName: params.user.nome,
        osLabel: label,
        reasonCancelamento: 'Venda balcão cancelada',
        reasonRefund: 'Estorno de venda balcão',
        notesRefund: `Estorno de ${label}`,
        craftMetaExtra: {
          origem: 'estorno_venda_balcao',
          counter_sale_id: vendaAtual.id,
          fase: ETAPA,
        },
      })
      caixaStatus = caixa.status
      caixaMovimentoId = caixa.movimento?.id
      if (caixa.status === 'sem_caixa_para_estorno') {
        caixaAviso =
          'Venda cancelada. O estorno de caixa ficou pendente porque não há caixa aberto.'
      } else if (caixa.status === 'erro') {
        caixaAviso =
          caixa.erro ||
          'Venda cancelada, mas o ajuste de caixa precisa de revisão.'
      }
    }
  }

  // 4) Marca venda cancelada + auditoria (não apaga histórico).
  const craftMeta = {
    ...vendaAtual.craft_meta,
    cancelamento: {
      cancelado_em: agora,
      cancelado_por: params.user.id,
      cancelado_por_nome: params.user.nome,
      motivo_cancelamento: motivo,
      estoque_estornado: estoqueResult.estornado || estoqueResult.ja_estornado,
      financeiro_estornado: fin.status === 'cancelado' || fin.status === 'ja_cancelado',
      caixa_estornado:
        caixaStatus === 'sale_cancelado' ||
        caixaStatus === 'sale_ja_cancelado' ||
        caixaStatus === 'refund_criado' ||
        caixaStatus === 'refund_ja_existia',
      caixa_status: caixaStatus,
      financeiro_ids: fin.ids,
      estoque_movimentos: estoqueResult.itens.map((i) => i.movimento_id).filter(Boolean),
      caixa_movimento_id: caixaMovimentoId ?? null,
      etapa: ETAPA,
    },
    estorno_estoque: estoqueResult.estornado || estoqueResult.ja_estornado,
    estorno_financeiro: fin.status === 'cancelado' || fin.status === 'ja_cancelado',
    estorno_caixa:
      caixaStatus === 'sale_cancelado' ||
      caixaStatus === 'sale_ja_cancelado' ||
      caixaStatus === 'refund_criado' ||
      caixaStatus === 'refund_ja_existia' ||
      caixaStatus === 'sem_caixa_para_estorno',
    cancelado_em: agora,
    cancelado_por: params.user.id,
    motivo_cancelamento: motivo,
  }

  try {
    const vendaCancelada = await atualizarVendaBalcao(params.officeId, vendaAtual.id, {
      status: 'canceled',
      payment_status: 'canceled',
      pending_amount: 0,
      canceled_at: agora,
      canceled_by: params.user.id,
      canceled_by_name: params.user.nome,
      cancel_reason: motivo,
      craft_meta: craftMeta,
    })

    limparIndicadoresSyncAposCancelamento(params.officeId, fin.ids, {
      houveFalhaFinanceiro: falhaFinanceiroIds.length > 0,
      falhaIds: falhaFinanceiroIds,
    })

    return {
      status: 'cancelada',
      venda: vendaCancelada,
      estoque: estoqueResult,
      financeiro: {
        status: fin.status,
        ids: fin.ids,
      },
      caixa: {
        status: caixaStatus,
        aviso: caixaAviso,
        movimento_id: caixaMovimentoId,
      },
      avisoFiscalRascunho:
        'Esta venda foi cancelada. Revise ou exclua o rascunho fiscal relacionado, se houver.',
    }
  } catch (e) {
    logErroVendaBalcao({
      etapa: 'atualizar_craft_meta',
      erro: e,
      payload: { sale_id: vendaAtual.id, etapa: ETAPA },
    })
    if (e instanceof VendaBalcaoSaveError) throw e
    throw new VendaBalcaoSaveError(
      'desconhecida',
      e,
      'Não foi possível concluir o cancelamento. Tente novamente.'
    )
  }
}
