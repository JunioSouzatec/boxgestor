import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { localCraftRepository } from '@/services/repository/local.repository'
import { emitirEventoPersistencia, emitirDiagnosticoPendenciasAtualizado, contarPagamentosPendentesTotais } from '@/services/persistence-status.events'
import { processarFilaSyncPendente } from '@/services/repository/hybrid.repository'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import {
  persistirFase1NoSupabase,
  extrairDadosFase1,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import {
  persistirPagamentosNoSupabase,
  sincronizarPagamentosPendentes,
  aplicarResultadoSyncPagamentosLocal,
  aplicarCorrecoesOsPagamentosLocal,
} from '@/services/supabase-sync/supabase-payments.persistence'
import { precisaSincronizarPagamento } from '@/services/pagamentos/payment-dedupe.helpers'
import {
  arquivarPagamentosOrfaos,
  limparPagamentosOrfaos,
  removerOrfaosDaFilaSync,
} from '@/services/pagamentos/payment-orphan.service'
import {
  repararVinculoPagamentosComOs,
  sincronizarOsPendentesNoSupabase,
} from '@/services/supabase-sync/payment-os-sync.service'
import {
  diagnosticarPagamentosPendentesCompleto,
  resumirPendenciasPagamentos,
  type PendenciaPagamentoDiagnostico,
} from '@/services/pagamentos/payment-pending-diagnostic.service'
import {
  pendenciasSyncBloqueadasPorDuplicidade,
} from '@/services/pagamentos/payment-pending-resolution.service'
import { salvarEstadoSincronizacao } from '@/services/supabase-sync/sync-state.storage'
import type {
  ContagemSyncEnviados,
  ResultadoSincronizacaoSupabase,
} from '@/services/supabase-sync/supabase-sync.types'
import { OFFICE_ID } from '@/types/base'
import type { CraftDatabase } from '@/types/database'

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

  const idsPendentes = db.lancamentos
    .filter((l) => precisaSincronizarPagamento(l))
    .map((l) => l.id)

  const resultadoPagamentos =
    idsPendentes.length > 0
      ? await persistirPagamentosNoSupabase(officeId, db, {
          lancamentoIds: idsPendentes,
          sincronizarDependencias: true,
        })
      : {
          ok: true,
          erros: [],
          enviados: 0,
          contagem: { service_order_payments: 0, financial_transactions: 0 },
          sincronizados_ids: [],
          correcoes_os: [],
          duplicatas_evitadas_ids: [],
          sync_atualizados: [],
          orfaos_marcados: [],
        }

  if (precisaPersistirResultadoPagamentos(resultadoPagamentos)) {
    const atualizado = aplicarResultadoSyncPagamentosLocal(db, resultadoPagamentos)
    localCraftRepository.salvar(officeId, atualizado)
    const orfaos = idsOrfaosDoResultado(resultadoPagamentos)
    if (orfaos.size > 0) {
      removerOrfaosDaFilaSync(officeId, [...orfaos])
    }
  }

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

function precisaPersistirResultadoPagamentos(resultado: {
  correcoes_os: unknown[]
  sync_atualizados: unknown[]
  orfaos_marcados?: unknown[]
}): boolean {
  return (
    resultado.correcoes_os.length > 0 ||
    resultado.sync_atualizados.length > 0 ||
    (resultado.orfaos_marcados?.length ?? 0) > 0
  )
}

function idsOrfaosDoResultado(resultado: { orfaos_marcados?: { lancamento_id: string }[] }): Set<string> {
  return new Set((resultado.orfaos_marcados ?? []).map((o) => o.lancamento_id))
}

function enfileirarPagamentoSePendente(officeId: string, lancamentoId: string): void {
  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: 'update',
    entidade: 'lancamento',
    entidade_id: lancamentoId,
  })
}

export async function arquivarPagamentosOrfaosLocais(
  officeId: string = OFFICE_ID,
  ids: string[],
  modo: 'limpar' | 'arquivar' = 'arquivar'
): Promise<{ processados: number; db: CraftDatabase }> {
  if (ids.length === 0) {
    const db = lerDadosLocalStorage(officeId)
    return { processados: 0, db }
  }

  const db = lerDadosLocalStorage(officeId)
  const resultado =
    modo === 'limpar' ? limparPagamentosOrfaos(db, ids) : arquivarPagamentosOrfaos(db, ids)

  localCraftRepository.salvar(officeId, resultado.db)
  removerOrfaosDaFilaSync(officeId, resultado.ids)
  emitirDiagnosticoPendenciasAtualizado(officeId)

  return { processados: resultado.processados, db: resultado.db }
}

export async function recarregarDiagnosticoPendencias(
  officeId: string = OFFICE_ID,
  dados?: CraftDatabase
): Promise<{
  resumo: ReturnType<typeof resumirPendenciasPagamentos>
  itens: PendenciaPagamentoDiagnostico[]
}> {
  const db = dados ?? lerDadosLocalStorage(officeId)
  const itens = await diagnosticarPagamentosPendentesCompleto(db, officeId)
  const resumo = resumirPendenciasPagamentos(itens)
  emitirDiagnosticoPendenciasAtualizado(officeId)
  return { resumo, itens }
}

export async function limparPendenciasInvalidasLocais(
  officeId: string = OFFICE_ID,
  ids: string[],
  dados?: CraftDatabase
): Promise<{ processados: number; db: CraftDatabase }> {
  if (ids.length === 0) {
    const db = dados ?? lerDadosLocalStorage(officeId)
    return { processados: 0, db }
  }

  const db = dados ?? lerDadosLocalStorage(officeId)
  const idsComLancamento = ids.filter((id) => db.lancamentos.some((l) => l.id === id))
  const idsFantasma = ids.filter((id) => !db.lancamentos.some((l) => l.id === id))

  let dbAtual = db
  let processados = 0

  if (idsComLancamento.length > 0) {
    const resultado = limparPagamentosOrfaos(dbAtual, idsComLancamento)
    dbAtual = resultado.db
    processados += resultado.processados
  }

  removerOrfaosDaFilaSync(officeId, [...idsComLancamento, ...idsFantasma])
  processados += idsFantasma.length

  localCraftRepository.salvar(officeId, dbAtual)
  emitirDiagnosticoPendenciasAtualizado(officeId)

  return { processados, db: dbAtual }
}

export async function sincronizarOsPendentesComSupabase(
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

  const db = lerDadosLocalStorage(officeId)
  const resultado = await sincronizarOsPendentesNoSupabase(officeId, db)
  const fimEm = new Date().toISOString()

  enviados.service_orders = resultado.osSincronizadas
  enviados.total = resultado.osSincronizadas

  const syncResult: ResultadoSincronizacaoSupabase = {
    ok: resultado.ok,
    mensagem: resultado.mensagem,
    inicioEm,
    fimEm,
    enviados,
    erros: resultado.erros.map((e) => ({ entidade: 'Ordem de Serviço', mensagem: e })),
  }

  salvarEstadoSincronizacao({
    ultimaSincronizacao: fimEm,
    ultimoResultado: syncResult,
  })

  if (resultado.ok) {
    emitirEventoPersistencia({ type: 'supabase_ok' })
  }

  return syncResult
}

export async function repararVinculoPagamentosComSupabase(
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

  const db = lerDadosLocalStorage(officeId)
  const resultado = await repararVinculoPagamentosComOs(officeId, db)
  const fimEm = new Date().toISOString()

  if (resultado.correcoes_os.length > 0) {
    const corrigido = aplicarCorrecoesOsPagamentosLocal(db, resultado.correcoes_os)
    localCraftRepository.salvar(officeId, corrigido)
  }

  const erros = resultado.pagamentosSemOs.map((p) => ({
    entidade: 'Pagamento OS',
    id: p.lancamento_id,
    mensagem: p.motivo,
  }))

  const syncResult: ResultadoSincronizacaoSupabase = {
    ok: resultado.ok,
    mensagem: resultado.mensagem,
    inicioEm,
    fimEm,
    enviados,
    erros,
  }

  salvarEstadoSincronizacao({
    ultimaSincronizacao: fimEm,
    ultimoResultado: syncResult,
  })

  const { total, vinculoOs } = contarPagamentosPendentesTotais(officeId)
  emitirEventoPersistencia({
    type: 'fila_atualizada',
    pendentes: total,
    vinculo_os: vinculoOs > 0,
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

  const { bloqueado } = pendenciasSyncBloqueadasPorDuplicidade(officeId, db)
  if (bloqueado) {
    const fimEm = new Date().toISOString()
    return {
      ok: false,
      mensagem:
        'Existem possíveis pagamentos duplicados. Resolva as pendências individualmente.',
      inicioEm,
      fimEm,
      enviados,
      erros: [
        {
          entidade: 'Pagamento OS',
          mensagem:
            'Existem possíveis pagamentos duplicados. Resolva as pendências individualmente.',
        },
      ],
    }
  }

  const idsFila = syncQueueService
    .listar(officeId, 'pendente')
    .filter((i) => i.entidade === 'lancamento')
    .map((i) => i.entidade_id)

  const idsLocal = db.lancamentos
    .filter((l) => precisaSincronizarPagamento(l))
    .map((l) => l.id)

  const idsAlvo = [...new Set([...idsFila, ...idsLocal])]

  if (idsAlvo.length === 0) {
    const fimEm = new Date().toISOString()
    return {
      ok: true,
      mensagem: 'Nenhum pagamento pendente para sincronizar.',
      inicioEm,
      fimEm,
      enviados,
      erros: [],
    }
  }

  const resultado = await sincronizarPagamentosPendentes(officeId, db, idsAlvo)
  const fimEm = new Date().toISOString()

  if (precisaPersistirResultadoPagamentos(resultado)) {
    const corrigido = aplicarResultadoSyncPagamentosLocal(db, resultado)
    localCraftRepository.salvar(officeId, corrigido)
  }

  const idsOrfaos = idsOrfaosDoResultado(resultado)

  for (const id of idsAlvo) {
    if (idsOrfaos.has(id)) {
      removerOrfaosDaFilaSync(officeId, [id])
      continue
    }
    const falhou = resultado.erros.some((e) => e.id === id)
    const sincronizado =
      resultado.sincronizados_ids.includes(id) ||
      resultado.duplicatas_evitadas_ids.includes(id)
    if (falhou || !sincronizado) {
      enfileirarPagamentoSePendente(officeId, id)
      continue
    }
    syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', id)
    for (const item of syncQueueService.listar(officeId, 'pendente')) {
      if (item.entidade === 'lancamento' && item.entidade_id === id) {
        syncQueueService.marcarSincronizado(item.id)
      }
    }
  }

  const { total, vinculoOs } = contarPagamentosPendentesTotais(officeId)

  if (resultado.ok) {
    emitirEventoPersistencia({ type: 'pagamento_ok', mensagem: resultado.mensagem })
    emitirEventoPersistencia({ type: 'supabase_ok' })
  } else if (resultado.enviados > 0) {
    emitirEventoPersistencia({
      type: 'pagamentos_pendentes',
      mensagem: resultado.mensagem,
      pendentes: total,
      vinculo_os: vinculoOs > 0,
    })
  } else {
    emitirEventoPersistencia({
      type: 'pagamentos_pendentes',
      mensagem: resultado.mensagem,
      pendentes: total,
      vinculo_os: vinculoOs > 0,
    })
  }
  emitirEventoPersistencia({
    type: 'fila_atualizada',
    pendentes: total,
    vinculo_os: vinculoOs > 0,
  })

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
