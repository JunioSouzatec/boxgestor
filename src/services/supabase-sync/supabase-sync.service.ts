import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { localCraftRepository } from '@/services/repository/local.repository'
import { emitirEventoPersistencia } from '@/services/persistence-status.events'
import { processarFilaSyncPendente } from '@/services/repository/hybrid.repository'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import {
  persistirFase1NoSupabase,
  extrairDadosFase1,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import {
  persistirPagamentosNoSupabase,
  sincronizarPagamentosPendentes,
  MENSAGEM_SUCESSO_PAGAMENTO,
} from '@/services/supabase-sync/supabase-payments.persistence'
import { salvarEstadoSincronizacao } from '@/services/supabase-sync/sync-state.storage'
import type {
  ContagemSyncEnviados,
  ResultadoSincronizacaoSupabase,
} from '@/services/supabase-sync/supabase-sync.types'
import { OFFICE_ID } from '@/types/base'

function contagemVazia(): ContagemSyncEnviados {
  return {
    office: 0,
    settings: 0,
    customers: 0,
    motorcycles: 0,
    service_orders: 0,
    service_order_payments: 0,
    financial_transactions: 0,
    total: 0,
  }
}

function lerDadosLocalStorage(officeId: string = OFFICE_ID) {
  return localCraftRepository.carregar(officeId)
}

export async function sincronizarDadosLocaisComSupabase(
  officeId: string = OFFICE_ID
): Promise<ResultadoSincronizacaoSupabase> {
  const inicioEm = new Date().toISOString()
  const enviados = contagemVazia()

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      mensagem: 'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
      inicioEm,
      fimEm: new Date().toISOString(),
      enviados,
      erros: [{ entidade: 'conexão', mensagem: 'Variáveis de ambiente ausentes' }],
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      mensagem: 'Não foi possível inicializar o cliente Supabase.',
      inicioEm,
      fimEm: new Date().toISOString(),
      enviados,
      erros: [{ entidade: 'conexão', mensagem: 'Cliente Supabase indisponível' }],
    }
  }

  const db = lerDadosLocalStorage(officeId)
  const dadosFase1 = extrairDadosFase1(db)
  const resultadoFase1 = await persistirFase1NoSupabase(officeId, dadosFase1)
  const resultadoPagamentos = await persistirPagamentosNoSupabase(officeId, db)

  const fimEm = new Date().toISOString()
  const totalEnviados = resultadoFase1.enviados + resultadoPagamentos.enviados

  if (totalEnviados > 0) {
    enviados.office = resultadoFase1.contagem.office
    enviados.settings = resultadoFase1.contagem.settings
    enviados.customers = resultadoFase1.contagem.customers
    enviados.motorcycles = resultadoFase1.contagem.motorcycles
    enviados.service_orders = resultadoFase1.contagem.service_orders
    enviados.service_order_payments = resultadoPagamentos.contagem.service_order_payments
    enviados.financial_transactions = resultadoPagamentos.contagem.financial_transactions
    enviados.total = totalEnviados
  }

  const erros = [...resultadoFase1.erros, ...resultadoPagamentos.erros]
  const ok = (resultadoFase1.ok || resultadoFase1.enviados > 0) &&
    (resultadoPagamentos.ok || resultadoPagamentos.enviados > 0 || db.lancamentos.length === 0)

  const syncResult: ResultadoSincronizacaoSupabase = {
    ok: ok && totalEnviados > 0,
    mensagem: ok
      ? totalEnviados > 0
        ? `Sincronização concluída: ${totalEnviados} registro(s) enviado(s). Pagamentos: ${resultadoPagamentos.contagem.service_order_payments} OS, ${resultadoPagamentos.contagem.financial_transactions} financeiro(s).`
        : 'Nenhum dado local encontrado para sincronizar.'
      : `Sincronização parcial: ${totalEnviados} enviado(s), ${erros.length} erro(s).`,
    inicioEm,
    fimEm,
    enviados,
    erros,
  }

  salvarEstadoSincronizacao({
    ultimaSincronizacao: fimEm,
    ultimoResultado: syncResult,
  })

  return syncResult
}

export async function sincronizarPagamentosPendentesComSupabase(
  officeId: string = OFFICE_ID
): Promise<ResultadoSincronizacaoSupabase> {
  const inicioEm = new Date().toISOString()
  const enviados = contagemVazia()

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      mensagem: 'Supabase não configurado.',
      inicioEm,
      fimEm: new Date().toISOString(),
      enviados,
      erros: [{ entidade: 'conexão', mensagem: 'Variáveis ausentes' }],
    }
  }

  await processarFilaSyncPendente(officeId)

  const db = lerDadosLocalStorage(officeId)
  const idsFila = syncQueueService
    .listar(officeId, 'pendente')
    .filter((i) => i.entidade === 'lancamento')
    .map((i) => i.entidade_id)

  const idsAlvo =
    idsFila.length > 0
      ? idsFila
      : db.lancamentos.filter((l) => !l.cancelado && l.sync_pendente).map((l) => l.id)

  const resultado = await sincronizarPagamentosPendentes(officeId, db, idsAlvo)
  const fimEm = new Date().toISOString()

  for (const id of idsAlvo) {
    const falhou = resultado.erros.some((e) => e.id === id)
    if (falhou) continue
    syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', id)
    for (const item of syncQueueService.listar(officeId, 'pendente')) {
      if (item.entidade === 'lancamento' && item.entidade_id === id) {
        syncQueueService.marcarSincronizado(item.id)
      }
    }
  }

  const pendentes = syncQueueService.contarPendentes(officeId)
  if (resultado.ok) {
    emitirEventoPersistencia({ type: 'pagamento_ok', mensagem: MENSAGEM_SUCESSO_PAGAMENTO })
    emitirEventoPersistencia({ type: 'supabase_ok' })
  } else if (resultado.enviados > 0) {
    emitirEventoPersistencia({
      type: 'pagamentos_pendentes',
      mensagem: resultado.mensagem,
      pendentes,
    })
  } else {
    emitirEventoPersistencia({
      type: 'pagamentos_pendentes',
      mensagem: resultado.mensagem,
      pendentes,
    })
  }
  emitirEventoPersistencia({ type: 'fila_atualizada', pendentes })

  enviados.service_order_payments = resultado.contagem.service_order_payments
  enviados.financial_transactions = resultado.contagem.financial_transactions
  enviados.total = resultado.enviados

  const syncResult: ResultadoSincronizacaoSupabase = {
    ok: resultado.ok || resultado.enviados > 0,
    mensagem: resultado.mensagem,
    inicioEm,
    fimEm,
    enviados,
    erros: resultado.erros,
  }

  salvarEstadoSincronizacao({
    ultimaSincronizacao: fimEm,
    ultimoResultado: syncResult,
  })

  return syncResult
}
