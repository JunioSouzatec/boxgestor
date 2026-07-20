import { logBootstrap } from '@/lib/bootstrap-debug'
import { mesclarPreservandoEdicoesConcorrentes } from '@/lib/merge-edicoes-concorrentes'
import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import { MSG, logDetalheTecnicoDev } from '@/lib/mensagens-usuario'
import { BOOTSTRAP_TIMEOUT_MS, FILA_SYNC_TIMEOUT_MS, withTimeout } from '@/lib/with-timeout'
import {
  logSyncDiag,
  logSyncPull,
  registrarUltimoPullModulo,
} from '@/services/sync/sync-diagnostico'
import { operacaoSalvamentoExplicitoAtiva } from '@/services/supabase-sync/persistencia-opcoes'
import {
  aplicarOfficeUuidEmDadosFase1,
  obterContextoOfficeSupabase,
} from '@/lib/supabase-office-context'
import {
  atualizarContagemPendenciasAtivas,
  emitirEventoPersistencia,
} from '@/services/persistence-status.events'
import {
  consumirLancamentosRecentes,
  consumirPularPagamentosProximaPersistencia,
  consumirPularPersistenciaRemotaProxima,
  marcarLancamentosRecentes,
  marcarPularPersistenciaRemotaProxima,
} from '@/services/supabase-sync/persistencia-opcoes'
import { localCraftRepository } from '@/services/repository/local.repository'
import type { ICraftRepository } from '@/services/repository/types'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import {
  carregarFase1DoSupabase,
  extrairDadosFase1,
  extrairDadosFase1ParaOs,
  mesclarFase1Remota,
  persistirFase1NoSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import {
  aplicarResultadoSyncPagamentosLocal,
  carregarPagamentosDoSupabase,
  MENSAGEM_DUPLICIDADE_EVITADA,
  MENSAGEM_FALLBACK_PAGAMENTO,
  MENSAGEM_SUCESSO_PAGAMENTO,
  mesclarLancamentos,
  persistirPagamentosNoSupabase,
  sincronizarPagamentosPendentes,
} from '@/services/supabase-sync/supabase-payments.persistence'
import { precisaSincronizarPagamento } from '@/services/pagamentos/payment-dedupe.helpers'
import { reconciliarPendenciasPagamentosOffice } from '@/services/pagamentos/payment-sync-reconcile.service'
import { registrarAuditoriaSyncPendencia } from '@/services/pagamentos/payment-sync-audit.storage'
import {
  contarFilaPendentes,
  logCarregamentoSupabaseDev,
} from '@/services/supabase-sync/supabase-load-debug'
import { atualizarStatusFinanceiroOrdens } from '@/services/pagamentos/payment-archive.service'
import { processarFilaLembretesPendente } from '@/services/lembretes/lembretes-sync.service'
import { aplicarDedupClientesNoDatabase } from '@/services/clientes/deduplicate-clientes.service'
import {
  mesclarComissoesNoDatabase,
  processarFilaComissoesPendente,
  publicarPerfisComissaoLocais,
} from '@/services/comissoes/comissoes-sync.service'
import {
  mesclarEstoqueNoDatabase,
  processarFilaPecasPendente,
  publicarEstoqueLocais,
  publicarPecasOrfasLocais,
} from '@/services/estoque/estoque-sync.service'
import type { CraftDatabase } from '@/types/database'

const MENSAGEM_FALLBACK_LOCAL = MSG.semConexao

function enfileirarPagamentoPendente(officeId: string, lancamentoId: string): void {
  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: 'update',
    entidade: 'lancamento',
    entidade_id: lancamentoId,
  })
  registrarAuditoriaSyncPendencia({
    acao: 'criada',
    lancamento_id: lancamentoId,
    motivo: 'Fila local — falha real ao enviar ao Supabase',
  })
}

function enfileirarPagamentosDoDatabase(officeId: string, dados: CraftDatabase): void {
  for (const l of dados.lancamentos) {
    if (precisaSincronizarPagamento(l)) enfileirarPagamentoPendente(officeId, l.id)
  }
}

function enfileirarFase1Pendente(officeId: string, dados: CraftDatabase): void {
  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: 'update',
    entidade: 'configuracao',
    entidade_id: officeId,
    payload: { sync_fase1: true, dados: extrairDadosFase1(dados) },
  })
  atualizarContagemPendenciasAtivas(officeId)
}

function enfileirarOrdemServicoPendente(officeId: string, osId: string): void {
  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: 'update',
    entidade: 'ordem_servico',
    entidade_id: osId,
  })
  atualizarContagemPendenciasAtivas(officeId)
}

function idsOrdensServicoComErro(erros: { entidade: string; id?: string }[]): Set<string> {
  return new Set(
    erros
      .filter((e) => e.entidade === 'Ordem de Serviço' && e.id)
      .map((e) => e.id as string)
  )
}

function atualizarFilaOrdensServicoAposPersistencia(
  officeId: string,
  dados: CraftDatabase,
  erros: { entidade: string; id?: string }[]
): void {
  const osComErro = idsOrdensServicoComErro(erros)

  for (const os of dados.ordens_servico) {
    if (osComErro.has(os.id)) {
      enfileirarOrdemServicoPendente(officeId, os.id)
    } else {
      syncQueueService.marcarSincronizadosPorEntidade(officeId, 'ordem_servico', os.id)
    }
  }

  if (osComErro.size === 0) {
    limparFilaAposSucessoSupabase(officeId)
  } else {
    syncQueueService.limparPendentesFase1(officeId)
    atualizarContagemPendenciasAtivas(officeId)
  }
}

function limparFilaAposSucessoSupabase(officeId: string): void {
  const removidos = syncQueueService.limparPendentesFase1(officeId)
  if (removidos > 0 && import.meta.env.DEV) {
    console.info('[Craft Supabase] Fila fase1 limpa após persistência', { removidos })
  }
  atualizarContagemPendenciasAtivas(officeId)
}

/** Processamento manual da fila — fase 1 + pagamentos */
export async function processarFilaSyncPendente(officeId: string): Promise<boolean> {
  const pendentes = syncQueueService.listar(officeId, 'pendente')
  const fase1 = pendentes.filter(
    (i) =>
      i.entidade === 'configuracao' &&
      i.payload &&
      typeof i.payload === 'object' &&
      (i.payload as { sync_fase1?: boolean }).sync_fase1
  )
  const pagamentosFila = pendentes.filter((i) => i.entidade === 'lancamento')
  const ordensServicoFila = pendentes.filter((i) => i.entidade === 'ordem_servico')
  const lembretesFila = pendentes.filter((i) => i.entidade === 'lembrete')
  const comissoesFila = pendentes.filter((i) => i.entidade === 'perfil_comissao')
  const pecasFila = pendentes.filter((i) => i.entidade === 'peca')

  if (
    fase1.length === 0 &&
    pagamentosFila.length === 0 &&
    ordensServicoFila.length === 0 &&
    lembretesFila.length === 0 &&
    comissoesFila.length === 0 &&
    pecasFila.length === 0
  ) {
    return true
  }

  let algumOk = false
  const contexto = await obterContextoOfficeSupabase(officeId)
  const officeUuid = contexto?.officeUuid ?? officeId

  for (const item of fase1) {
    const payload = item.payload as { dados?: ReturnType<typeof extrairDadosFase1> }
    if (!payload.dados) continue

    const dados = contexto
      ? aplicarOfficeUuidEmDadosFase1(payload.dados, officeUuid)
      : payload.dados

    const resultado = await persistirFase1NoSupabase(officeUuid, dados, contexto?.opcoes)
    const local = localCraftRepository.carregar(officeId)
    if (resultado.ok || resultado.contagem.customers + resultado.contagem.motorcycles > 0) {
      syncQueueService.marcarSincronizado(item.id)
      atualizarFilaOrdensServicoAposPersistencia(officeId, local, resultado.erros)
      algumOk = true
    } else {
      syncQueueService.marcarErro(item.id, resultado.erros[0]?.mensagem ?? 'Erro ao sincronizar')
    }
  }

  if (ordensServicoFila.length > 0) {
    const local = localCraftRepository.carregar(officeId)
    for (const item of ordensServicoFila) {
      const parcial = extrairDadosFase1ParaOs(local, item.entidade_id)
      if (!parcial) {
        syncQueueService.marcarErro(item.id, 'OS não encontrada nos dados locais')
        continue
      }

      const dados = contexto
        ? aplicarOfficeUuidEmDadosFase1(parcial, officeUuid)
        : parcial

      const resultado = await persistirFase1NoSupabase(officeUuid, dados, contexto?.opcoes)
      const osComErro = idsOrdensServicoComErro(resultado.erros)

      if (!osComErro.has(item.entidade_id) && resultado.contagem.service_orders > 0) {
        syncQueueService.marcarSincronizado(item.id)
        syncQueueService.marcarSincronizadosPorEntidade(
          officeId,
          'ordem_servico',
          item.entidade_id
        )
        algumOk = true
      } else {
        syncQueueService.marcarErro(
          item.id,
          resultado.erros.find((e) => e.id === item.entidade_id)?.mensagem ??
            resultado.erros[0]?.mensagem ??
            'Erro ao sincronizar OS'
        )
      }
    }
  }

  if (pagamentosFila.length > 0) {
    let local = localCraftRepository.carregar(officeId)
    const ids = pagamentosFila.map((i) => i.entidade_id)
    const resultado = await sincronizarPagamentosPendentes(officeId, local, ids)
    if (resultado.correcoes_os.length > 0 || resultado.sync_atualizados.length > 0 || (resultado.orfaos_marcados?.length ?? 0) > 0) {
      local = aplicarResultadoSyncPagamentosLocal(local, resultado)
      localCraftRepository.salvar(officeId, local)
    }
    const orfaosFila = new Set(
      (resultado.orfaos_marcados ?? []).map((o) => o.lancamento_id)
    )
    if (resultado.ok || resultado.enviados > 0 || orfaosFila.size > 0) {
      for (const item of pagamentosFila) {
        syncQueueService.marcarSincronizado(item.id)
      }
      algumOk = true
    } else {
      for (const item of pagamentosFila) {
        syncQueueService.marcarErro(item.id, resultado.erros[0]?.mensagem ?? 'Erro ao sincronizar pagamento')
      }
    }
  }

  if (lembretesFila.length > 0) {
    const okLembretes = await processarFilaLembretesPendente(officeId)
    if (okLembretes) algumOk = true
  }

  if (comissoesFila.length > 0) {
    const okComissoes = await processarFilaComissoesPendente(officeId)
    if (okComissoes) algumOk = true
  }

  if (pecasFila.length > 0) {
    const okPecas = await processarFilaPecasPendente(officeId)
    if (okPecas) algumOk = true
  } else {
    // Cobre peças órfãs que nunca entraram na fila (create antigo só-local)
    const orfas = await publicarPecasOrfasLocais(officeId)
    if (orfas > 0) algumOk = true
  }

  if (algumOk) {
    const aindaPendentes = syncQueueService.contarPendentes(officeId)
    if (aindaPendentes === 0) {
      limparFilaAposSucessoSupabase(officeId)
    }
    emitirEventoPersistencia({ type: 'supabase_ok' })
  } else {
    atualizarContagemPendenciasAtivas(officeId)
  }

  return algumOk
}

const PERSIST_REMOTO_DEBOUNCE_MS = 1200

export class HybridCraftRepository implements ICraftRepository {
  private lancamentoIdsPorOffice = new Map<string, Set<string>>()
  private persistRemotoTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private persistRemotoSnapshots = new Map<string, CraftDatabase>()
  private persistRemotoChains = new Map<string, Promise<void>>()

  carregar(officeId: string): CraftDatabase {
    const dados = localCraftRepository.carregar(officeId)
    this.lancamentoIdsPorOffice.set(
      officeId,
      new Set(dados.lancamentos.map((l) => l.id))
    )
    return dados
  }

  salvar(officeId: string, dados: CraftDatabase): void {
    const idsAnteriores = this.lancamentoIdsPorOffice.get(officeId) ?? new Set<string>()
    const novos = dados.lancamentos.filter((l) => !idsAnteriores.has(l.id)).map((l) => l.id)
    let snapshot = dados
    if (novos.length > 0) {
      marcarLancamentosRecentes(novos)
      if (getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()) {
        snapshot = {
          ...dados,
          lancamentos: dados.lancamentos.map((l) =>
            novos.includes(l.id) && l.ordem_servico_id
              ? {
                  ...l,
                  sync_pendente: operacaoSalvamentoExplicitoAtiva() ? false : true,
                  client_payment_id: l.client_payment_id ?? l.id,
                }
              : l
          ),
        }
      }
    }
    this.lancamentoIdsPorOffice.set(officeId, new Set(snapshot.lancamentos.map((l) => l.id)))

    localCraftRepository.salvar(officeId, snapshot)

    if (consumirPularPersistenciaRemotaProxima()) {
      return
    }

    if (getCraftPersistenceMode() !== 'supabase' || !isSupabaseConfigured()) {
      return
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enfileirarFase1Pendente(officeId, dados)
      enfileirarPagamentosDoDatabase(officeId, dados)
      if (!operacaoSalvamentoExplicitoAtiva()) {
        emitirEventoPersistencia({
          type: 'offline',
          mensagem: MSG.semConexao,
        })
      }
      return
    }

    this.agendarPersistirRemoto(officeId, snapshot)
  }

  private agendarPersistirRemoto(officeId: string, snapshot: CraftDatabase): void {
    this.persistRemotoSnapshots.set(officeId, snapshot)

    const timerAnterior = this.persistRemotoTimers.get(officeId)
    if (timerAnterior) clearTimeout(timerAnterior)

    const timer = setTimeout(() => {
      this.persistRemotoTimers.delete(officeId)
      const dados = this.persistRemotoSnapshots.get(officeId)
      this.persistRemotoSnapshots.delete(officeId)
      if (!dados) return

      const anterior = this.persistRemotoChains.get(officeId) ?? Promise.resolve()
      const proximo = anterior
        .then(() => this.persistirRemoto(officeId, dados))
        .catch((err) => {
          console.warn('[Craft Supabase] Falha na persistência remota em fila:', err)
        })
      this.persistRemotoChains.set(officeId, proximo)
    }, PERSIST_REMOTO_DEBOUNCE_MS)

    this.persistRemotoTimers.set(officeId, timer)
  }

  resetar(officeId: string): CraftDatabase {
    return localCraftRepository.resetar(officeId)
  }

  private async persistirRemoto(officeId: string, dados: CraftDatabase): Promise<void> {
    const contexto = await obterContextoOfficeSupabase(officeId)
    if (!contexto) {
      console.warn('[Craft Supabase] Persistência remota ignorada — sem office_id do profile.')
      enfileirarFase1Pendente(officeId, dados)
      logDetalheTecnicoDev('persistência remota', 'Sem office_id do profile')
      if (!operacaoSalvamentoExplicitoAtiva()) {
        emitirEventoPersistencia({
          type: 'fallback',
          mensagem: MSG.erroSalvar,
        })
      }
      return
    }

    const fase1 = aplicarOfficeUuidEmDadosFase1(extrairDadosFase1(dados), contexto.officeUuid)
    const resultado = await persistirFase1NoSupabase(
      contexto.officeUuid,
      fase1,
      contexto.opcoes
    )

    const fase1Ok =
      resultado.ok ||
      resultado.contagem.customers + resultado.contagem.motorcycles > 0 ||
      resultado.contagem.service_orders > 0

    if (!fase1Ok) {
      console.error('[Craft Supabase] Falha ao persistir fase 1:', resultado.erros)
      enfileirarFase1Pendente(officeId, dados)
      enfileirarPagamentosDoDatabase(officeId, dados)
      logDetalheTecnicoDev('fase 1 fallback', resultado.erros)
      emitirEventoPersistencia({
        type: 'fallback',
        escopo: 'geral',
        mensagem: MSG.erroSalvar,
      })
      return
    }

    atualizarFilaOrdensServicoAposPersistencia(officeId, dados, resultado.erros)
    for (const c of dados.clientes) {
      syncQueueService.marcarSincronizadosPorEntidade(officeId, 'cliente', c.id)
    }

    const osComErro = idsOrdensServicoComErro(resultado.erros)
    if (osComErro.size > 0) {
      logDetalheTecnicoDev('OS pendente sync', {
        quantidade: osComErro.size,
        ids: [...osComErro],
      })
      emitirEventoPersistencia({
        type: 'fallback',
        escopo: 'os',
        mensagem: MSG.atencaoSync,
      })
    }

    const pularPagamentos = consumirPularPagamentosProximaPersistencia()
    if (pularPagamentos) {
      emitirEventoPersistencia({ type: 'supabase_ok' })
      return
    }

    const lancamentosRecentes = consumirLancamentosRecentes()

    if (operacaoSalvamentoExplicitoAtiva() && lancamentosRecentes.length === 0) {
      emitirEventoPersistencia({ type: 'supabase_ok' })
      return
    }

    dados = localCraftRepository.carregar(officeId)

    const resultadoPagamentos = await persistirPagamentosNoSupabase(officeId, dados, {
      officeUuid: contexto.officeUuid,
      createdBy: contexto.userId,
      lancamentoIds: lancamentosRecentes.length > 0 ? lancamentosRecentes : undefined,
    })

    const temAtualizacaoLocal =
      resultadoPagamentos.sincronizados_ids.length > 0 ||
      resultadoPagamentos.correcoes_os.length > 0 ||
      resultadoPagamentos.sync_atualizados.length > 0 ||
      (resultadoPagamentos.orfaos_marcados?.length ?? 0) > 0

    if (temAtualizacaoLocal) {
      dados = aplicarResultadoSyncPagamentosLocal(
        localCraftRepository.carregar(officeId),
        resultadoPagamentos
      )
      marcarPularPersistenciaRemotaProxima()
      localCraftRepository.salvar(officeId, dados)
    }

    const idsOrfaos = new Set(
      (resultadoPagamentos.orfaos_marcados ?? []).map((o) => o.lancamento_id)
    )
    if (idsOrfaos.size > 0) {
      for (const id of idsOrfaos) {
        syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', id)
      }
    }

    const alvoRecentes =
      lancamentosRecentes.length > 0 ? lancamentosRecentes : dados.lancamentos.map((l) => l.id)

    const recentesOk = alvoRecentes.filter(
      (id) =>
        resultadoPagamentos.sincronizados_ids.includes(id) ||
        resultadoPagamentos.duplicatas_evitadas_ids.includes(id)
    )
    const recentesFalha = alvoRecentes.filter(
      (id) =>
        !resultadoPagamentos.sincronizados_ids.includes(id) &&
        !idsOrfaos.has(id)
    )

    if (lancamentosRecentes.length > 0 && recentesOk.length === lancamentosRecentes.length) {
      for (const id of recentesOk) {
        syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', id)
      }
      const msgDuplicata = resultadoPagamentos.duplicatas_evitadas_ids.length > 0
      emitirEventoPersistencia({
        type: 'pagamento_ok',
        mensagem: msgDuplicata ? MENSAGEM_DUPLICIDADE_EVITADA : MENSAGEM_SUCESSO_PAGAMENTO,
      })
      emitirEventoPersistencia({ type: 'supabase_ok' })
      return
    }

    if (lancamentosRecentes.length > 0 && recentesOk.length > 0) {
      for (const id of recentesOk) {
        syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', id)
      }
      for (const id of recentesFalha) {
        enfileirarPagamentoPendente(officeId, id)
      }
      const msg =
        resultadoPagamentos.erros[0]?.mensagem ??
        `${recentesOk.length} sincronizado(s), ${recentesFalha.length} erro(s).`
      emitirEventoPersistencia({
        type: 'pagamentos_pendentes',
        mensagem: msg,
        pendentes: syncQueueService.contarPendentes(officeId),
      })
      emitirEventoPersistencia({ type: 'supabase_ok' })
      return
    }

    if (resultadoPagamentos.ok) {
      for (const l of dados.lancamentos) {
        syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', l.id)
      }
      emitirEventoPersistencia({ type: 'pagamento_ok', mensagem: MENSAGEM_SUCESSO_PAGAMENTO })
      emitirEventoPersistencia({ type: 'supabase_ok' })
      return
    }

    if (lancamentosRecentes.length > 0) {
      for (const id of recentesFalha) {
        enfileirarPagamentoPendente(officeId, id)
      }
      console.error('[Craft Supabase] Falha ao registrar pagamento:', resultadoPagamentos.erros)
      emitirEventoPersistencia({
        type: 'pagamentos_pendentes',
        mensagem: resultadoPagamentos.erros[0]?.mensagem ?? MENSAGEM_FALLBACK_PAGAMENTO,
        pendentes: syncQueueService.contarPendentes(officeId),
      })
      emitirEventoPersistencia({ type: 'supabase_ok' })
      return
    }

    const pagamentosComErro = new Set(
      resultadoPagamentos.erros
        .filter((e) => e.id && !idsOrfaos.has(e.id))
        .map((e) => e.id as string)
    )

    if (resultadoPagamentos.enviados > 0) {
      for (const l of dados.lancamentos) {
        if (!pagamentosComErro.has(l.id)) {
          syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', l.id)
        } else {
          enfileirarPagamentoPendente(officeId, l.id)
        }
      }
    } else {
      enfileirarPagamentosDoDatabase(officeId, localCraftRepository.carregar(officeId))
    }

    console.error('[Craft Supabase] Falha ao persistir pagamentos:', resultadoPagamentos.erros)
    emitirEventoPersistencia({
      type: 'pagamentos_pendentes',
      mensagem: MENSAGEM_FALLBACK_PAGAMENTO,
      pendentes: syncQueueService.contarPendentes(officeId),
    })
    emitirEventoPersistencia({ type: 'supabase_ok' })
    void publicarPerfisComissaoLocais(officeId)
    void publicarEstoqueLocais(officeId)
  }
}

export async function carregarComSupabase(
  officeId: string,
  opcoes?: { silencioso?: boolean; processarFilaAposPull?: boolean }
): Promise<CraftDatabase> {
  const local = localCraftRepository.carregar(officeId)
  const cacheExistente = localCraftRepository.tenantExiste(officeId)
  const clientesLocaisAntes = local.clientes.length
  const filaPendentes = contarFilaPendentes(officeId)
  const fetchIniciadoEm = new Date().toISOString()
  const processarFilaAposPull = opcoes?.processarFilaAposPull !== false

  logBootstrap('hybrid_carregar_inicio', {
    officeId,
    cacheExistente,
    clientesLocaisAntes,
    origemInicial: cacheExistente ? 'localStorage' : 'memoria_placeholder',
  })

  if (getCraftPersistenceMode() !== 'supabase' || !isSupabaseConfigured()) {
    return local
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    logCarregamentoSupabaseDev({
      origem: 'localStorage_fallback',
      clientesSupabase: 0,
      clientesLocaisAntes,
      clientesAposDedup: clientesLocaisAntes,
      duplicadosRemovidos: 0,
      motos: local.motos.length,
      os: local.ordens_servico.length,
      filaPendentes,
    })
    if (!opcoes?.silencioso && !operacaoSalvamentoExplicitoAtiva()) {
      emitirEventoPersistencia({
        type: 'offline',
        mensagem: MENSAGEM_FALLBACK_LOCAL,
      })
    }
    return local
  }

  // Não repushar snapshot fase1 antigo antes do pull (causa “volta ao estado antigo”)
  const abandonados = syncQueueService.abandonarItensTravados(officeId)
  const fase1Limpos = syncQueueService.limparPendentesFase1(officeId)
  if (abandonados + fase1Limpos > 0) {
    logBootstrap('hybrid_fila_sanitizada', {
      officeId,
      abandonados,
      fase1Limpos,
    })
    atualizarContagemPendenciasAtivas(officeId)
  }

  try {
    const snapshotFinal = await withTimeout(
      carregarRemotoComMerge(officeId, local, fetchIniciadoEm, opcoes?.silencioso),
      BOOTSTRAP_TIMEOUT_MS,
      'carregar oficina remota'
    )

    // Fila (OS/pagamentos) em background — nunca bloqueia unlock da UI
    if (processarFilaAposPull) {
      void withTimeout(
        processarFilaSyncPendente(officeId),
        FILA_SYNC_TIMEOUT_MS,
        'processar fila sync'
      ).catch((err) => {
        console.warn('[Craft Supabase] Fila pós-pull falhou/timeout', err)
      })
    }

    return snapshotFinal
  } catch (err) {
    console.warn('[Craft Supabase] Bootstrap remoto falhou/timeout — usando local', {
      officeId,
      err,
    })
    logBootstrap('hybrid_carregar_timeout_ou_erro', {
      officeId,
      erro: String(err),
      fallback: 'localStorage',
    })
    if (!opcoes?.silencioso && !operacaoSalvamentoExplicitoAtiva()) {
      emitirEventoPersistencia({
        type: 'fallback',
        mensagem: 'Sincronização demorou. Abrindo com dados locais.',
      })
    }
    return local
  }
}

async function carregarRemotoComMerge(
  officeId: string,
  local: CraftDatabase,
  fetchIniciadoEm: string,
  silencioso?: boolean
): Promise<CraftDatabase> {
  const clientesLocaisAntes = local.clientes.length
  const filaPendentes = contarFilaPendentes(officeId)

  const contexto = await obterContextoOfficeSupabase(officeId)
  const officeUuid = contexto?.officeUuid ?? officeId

  const remoto = await carregarFase1DoSupabase(officeUuid, local)

  if (!remoto.ok || !remoto.dados) {
    logCarregamentoSupabaseDev({
      origem: 'localStorage_fallback',
      clientesSupabase: 0,
      clientesLocaisAntes,
      clientesAposDedup: clientesLocaisAntes,
      duplicadosRemovidos: 0,
      motos: local.motos.length,
      os: local.ordens_servico.length,
      filaPendentes,
    })
    if (!silencioso && !operacaoSalvamentoExplicitoAtiva()) {
      emitirEventoPersistencia({
        type: 'fallback',
        mensagem: remoto.mensagem ?? MENSAGEM_FALLBACK_LOCAL,
      })
    }
    return local
  }

  /** Pull remoto + LWW; edições locais during fetch têm prioridade (ver merge concorrente) */
  let snapshot = mesclarFase1Remota(local, remoto.dados)
  const dedupPosMerge = aplicarDedupClientesNoDatabase(snapshot)
  snapshot = dedupPosMerge.db

  const pagamentosRemoto = await carregarPagamentosDoSupabase(officeId, officeUuid, snapshot)

  if (pagamentosRemoto.ok) {
    snapshot = {
      ...snapshot,
      lancamentos: mesclarLancamentos(snapshot.lancamentos, pagamentosRemoto.lancamentos),
    }
  } else if (pagamentosRemoto.erros.length > 0) {
    if (import.meta.env.DEV) {
      console.warn('[Craft Supabase] Pagamentos não carregados do Supabase', pagamentosRemoto.erros)
    }
  }

  snapshot = atualizarStatusFinanceiroOrdens(snapshot)

  // Reconcile leve no bootstrap — evita N awaits longos; detalhe vai na fila pós-pull
  const reconciliado = await reconciliarPendenciasPagamentosOffice(officeId, snapshot, {
    consultarSupabase: false,
  })
  snapshot = reconciliado.db

  const snapshotComComissoes = await mesclarComissoesNoDatabase(officeId, {
    ...snapshot,
    lancamentos: snapshot.lancamentos.map((l) => ({
      ...l,
      client_payment_id: l.client_payment_id ?? l.id,
    })),
  })

  let snapshotFinal = await mesclarEstoqueNoDatabase(officeId, snapshotComComissoes, {
    prioridadeRemota: true,
  })

  // Não sobrescrever o que o usuário salvou enquanto o pull rodava
  const localFresher = localCraftRepository.carregar(officeId)
  snapshotFinal = mesclarPreservandoEdicoesConcorrentes(
    snapshotFinal,
    localFresher,
    fetchIniciadoEm
  )

  localCraftRepository.salvar(officeId, snapshotFinal)

  registrarUltimoPullModulo(officeId, 'geral')
  registrarUltimoPullModulo(officeId, 'fase1')
  logSyncPull(officeId, 'bootstrap_ok', {
    clientes: snapshotFinal.clientes.length,
    motos: snapshotFinal.motos.length,
    os: snapshotFinal.ordens_servico.length,
    pecas: snapshotFinal.pecas?.length ?? 0,
  })
  logSyncDiag('bootstrap_depois', officeId)

  logBootstrap('hybrid_carregar_sucesso', {
    officeId,
    officeIdCarregado: snapshotFinal.configuracao.office_id,
    origem: 'supabase',
    clientes: snapshotFinal.clientes.length,
    os: snapshotFinal.ordens_servico.length,
    nomeOficina: snapshotFinal.configuracao.nome,
    tipoOficina: snapshotFinal.configuracao.tipo_oficina,
  })

  logCarregamentoSupabaseDev({
    origem: 'supabase',
    clientesSupabase: remoto.dados.clientes.length,
    clientesLocaisAntes,
    clientesAposDedup: snapshotFinal.clientes.length,
    duplicadosRemovidos: Math.max(0, remoto.dados.clientes.length - snapshotFinal.clientes.length),
    motos: snapshotFinal.motos.length,
    os: snapshotFinal.ordens_servico.length,
    filaPendentes,
  })

  emitirEventoPersistencia({ type: 'supabase_ok' })
  return snapshotFinal
}

export const hybridCraftRepository = new HybridCraftRepository()
