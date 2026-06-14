import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import { MSG, logDetalheTecnicoDev } from '@/lib/mensagens-usuario'
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
import {
  contarFilaPendentes,
  logCarregamentoSupabaseDev,
} from '@/services/supabase-sync/supabase-load-debug'
import type { CraftDatabase } from '@/types/database'

const MENSAGEM_FALLBACK_LOCAL = MSG.semConexao

function enfileirarPagamentoPendente(officeId: string, lancamentoId: string): void {
  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: 'update',
    entidade: 'lancamento',
    entidade_id: lancamentoId,
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

  if (fase1.length === 0 && pagamentosFila.length === 0 && ordensServicoFila.length === 0) {
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

export class HybridCraftRepository implements ICraftRepository {
  private lancamentoIdsPorOffice = new Map<string, Set<string>>()

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
                  sync_pendente: true,
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
      emitirEventoPersistencia({
        type: 'offline',
        mensagem: MSG.semConexao,
      })
      return
    }

    void this.persistirRemoto(officeId, snapshot)
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
      emitirEventoPersistencia({
        type: 'fallback',
        mensagem: MSG.semConexao,
      })
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
        mensagem: MSG.semConexao,
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

    const resultadoPagamentos = await persistirPagamentosNoSupabase(officeId, dados, {
      officeUuid: contexto.officeUuid,
      createdBy: contexto.userId,
      lancamentoIds: lancamentosRecentes.length > 0 ? lancamentosRecentes : undefined,
    })

    if (resultadoPagamentos.correcoes_os.length > 0 || resultadoPagamentos.sync_atualizados.length > 0 || (resultadoPagamentos.orfaos_marcados?.length ?? 0) > 0) {
      dados = aplicarResultadoSyncPagamentosLocal(dados, resultadoPagamentos)
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
      enfileirarPagamentosDoDatabase(officeId, dados)
    }

    console.error('[Craft Supabase] Falha ao persistir pagamentos:', resultadoPagamentos.erros)
    emitirEventoPersistencia({
      type: 'pagamentos_pendentes',
      mensagem: MENSAGEM_FALLBACK_PAGAMENTO,
      pendentes: syncQueueService.contarPendentes(officeId),
    })
    emitirEventoPersistencia({ type: 'supabase_ok' })
  }
}

export async function carregarComSupabase(officeId: string): Promise<CraftDatabase> {
  const local = localCraftRepository.carregar(officeId)
  const clientesLocaisAntes = local.clientes.length
  const filaPendentes = contarFilaPendentes(officeId)

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
    emitirEventoPersistencia({
      type: 'offline',
      mensagem: MENSAGEM_FALLBACK_LOCAL,
    })
    return local
  }

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
    emitirEventoPersistencia({
      type: 'fallback',
      mensagem: remoto.mensagem ?? MENSAGEM_FALLBACK_LOCAL,
    })
    return local
  }

  /** Supabase é fonte da verdade para fase 1; localStorage cache + pagamentos mesclados */
  let snapshot = mesclarFase1Remota(local, remoto.dados)

  const pagamentosRemoto = await carregarPagamentosDoSupabase(
    officeId,
    officeUuid,
    snapshot
  )

  if (pagamentosRemoto.ok && pagamentosRemoto.lancamentos.length > 0) {
    snapshot = {
      ...snapshot,
      lancamentos: mesclarLancamentos(local.lancamentos, pagamentosRemoto.lancamentos),
    }
  } else if (!pagamentosRemoto.ok && pagamentosRemoto.erros.length > 0) {
    if (import.meta.env.DEV) {
      console.warn('[Craft Supabase] Pagamentos não carregados do Supabase', pagamentosRemoto.erros)
    }
  }

  const snapshotFinal = {
    ...snapshot,
    lancamentos: snapshot.lancamentos.map((l) => ({
      ...l,
      client_payment_id: l.client_payment_id ?? l.id,
    })),
  }

  localCraftRepository.salvar(officeId, snapshotFinal)

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
