import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import {
  aplicarOfficeUuidEmDadosFase1,
  obterContextoOfficeSupabase,
} from '@/lib/supabase-office-context'
import { emitirEventoPersistencia } from '@/services/persistence-status.events'
import { consumirPularPagamentosProximaPersistencia } from '@/services/supabase-sync/persistencia-opcoes'
import { localCraftRepository } from '@/services/repository/local.repository'
import type { ICraftRepository } from '@/services/repository/types'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import {
  carregarFase1DoSupabase,
  extrairDadosFase1,
  extrairDadosFase1ParaOs,
  mesclarFase1Remota,
  mensagemFallbackPersistencia,
  persistirFase1NoSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import {
  carregarPagamentosDoSupabase,
  MENSAGEM_FALLBACK_PAGAMENTO,
  MENSAGEM_SUCESSO_PAGAMENTO,
  mesclarLancamentos,
  persistirPagamentosNoSupabase,
  sincronizarPagamentosPendentes,
} from '@/services/supabase-sync/supabase-payments.persistence'
import {
  contarFilaPendentes,
  logCarregamentoSupabaseDev,
} from '@/services/supabase-sync/supabase-load-debug'
import type { CraftDatabase } from '@/types/database'

const MENSAGEM_FALLBACK_LOCAL =
  'Exibindo dados locais por segurança. Não foi possível carregar do Supabase.'

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
    if (!l.cancelado) enfileirarPagamentoPendente(officeId, l.id)
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
  emitirEventoPersistencia({
    type: 'fila_atualizada',
    pendentes: syncQueueService.contarPendentes(officeId),
  })
}

function enfileirarOrdemServicoPendente(officeId: string, osId: string): void {
  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: 'update',
    entidade: 'ordem_servico',
    entidade_id: osId,
  })
  emitirEventoPersistencia({
    type: 'fila_atualizada',
    pendentes: syncQueueService.contarPendentes(officeId),
  })
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
    emitirEventoPersistencia({
      type: 'fila_atualizada',
      pendentes: syncQueueService.contarPendentes(officeId),
    })
  }
}

function limparFilaAposSucessoSupabase(officeId: string): void {
  const removidos = syncQueueService.limparPendentesFase1(officeId)
  if (removidos > 0 && import.meta.env.DEV) {
    console.info('[Craft Supabase] Fila fase1 limpa após persistência', { removidos })
  }
  emitirEventoPersistencia({
    type: 'fila_atualizada',
    pendentes: syncQueueService.contarPendentes(officeId),
  })
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
    const local = localCraftRepository.carregar(officeId)
    const ids = pagamentosFila.map((i) => i.entidade_id)
    const resultado = await sincronizarPagamentosPendentes(officeId, local, ids)
    if (resultado.ok || resultado.enviados > 0) {
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
    emitirEventoPersistencia({
      type: 'fila_atualizada',
      pendentes: syncQueueService.contarPendentes(officeId),
    })
  }

  return algumOk
}

export class HybridCraftRepository implements ICraftRepository {
  carregar(officeId: string): CraftDatabase {
    return localCraftRepository.carregar(officeId)
  }

  salvar(officeId: string, dados: CraftDatabase): void {
    localCraftRepository.salvar(officeId, dados)

    if (getCraftPersistenceMode() !== 'supabase' || !isSupabaseConfigured()) {
      return
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enfileirarFase1Pendente(officeId, dados)
      enfileirarPagamentosDoDatabase(officeId, dados)
      emitirEventoPersistencia({
        type: 'offline',
        mensagem:
          'Sem internet. Dados salvos localmente e enfileirados para sincronizar quando voltar online.',
      })
      return
    }

    void this.persistirRemoto(officeId, dados)
  }

  resetar(officeId: string): CraftDatabase {
    return localCraftRepository.resetar(officeId)
  }

  private async persistirRemoto(officeId: string, dados: CraftDatabase): Promise<void> {
    const contexto = await obterContextoOfficeSupabase(officeId)
    if (!contexto) {
      console.warn('[Craft Supabase] Persistência remota ignorada — sem office_id do profile.')
      enfileirarFase1Pendente(officeId, dados)
      emitirEventoPersistencia({
        type: 'fallback',
        mensagem:
          'Usuário sem oficina vinculada no Supabase. Dados salvos apenas localmente.',
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
      emitirEventoPersistencia({
        type: 'fallback',
        escopo: 'geral',
        mensagem: mensagemFallbackPersistencia(resultado.erros),
      })
      return
    }

    atualizarFilaOrdensServicoAposPersistencia(officeId, dados, resultado.erros)
    for (const c of dados.clientes) {
      syncQueueService.marcarSincronizadosPorEntidade(officeId, 'cliente', c.id)
    }

    const osComErro = idsOrdensServicoComErro(resultado.erros)
    if (osComErro.size > 0) {
      const msgOs =
        osComErro.size === 1
          ? '1 ordem de serviço ficou pendente de sincronização (salva localmente).'
          : `${osComErro.size} ordens de serviço ficaram pendentes de sincronização (salvas localmente).`
      emitirEventoPersistencia({
        type: 'fallback',
        escopo: 'os',
        mensagem: msgOs,
      })
    }

    const pularPagamentos = consumirPularPagamentosProximaPersistencia()
    if (pularPagamentos) {
      emitirEventoPersistencia({ type: 'supabase_ok' })
      return
    }

    const resultadoPagamentos = await persistirPagamentosNoSupabase(officeId, dados, {
      officeUuid: contexto.officeUuid,
      createdBy: contexto.userId,
    })

    if (resultadoPagamentos.ok) {
      for (const l of dados.lancamentos) {
        syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', l.id)
      }
      emitirEventoPersistencia({ type: 'pagamento_ok', mensagem: MENSAGEM_SUCESSO_PAGAMENTO })
      emitirEventoPersistencia({ type: 'supabase_ok' })
      return
    }

    const pagamentosComErro = new Set(
      resultadoPagamentos.erros.filter((e) => e.id).map((e) => e.id as string)
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

  localCraftRepository.salvar(officeId, snapshot)

  logCarregamentoSupabaseDev({
    origem: 'supabase',
    clientesSupabase: remoto.dados.clientes.length,
    clientesLocaisAntes,
    clientesAposDedup: snapshot.clientes.length,
    duplicadosRemovidos: Math.max(0, remoto.dados.clientes.length - snapshot.clientes.length),
    motos: snapshot.motos.length,
    os: snapshot.ordens_servico.length,
    filaPendentes,
  })

  emitirEventoPersistencia({ type: 'supabase_ok' })
  return snapshot
}

export const hybridCraftRepository = new HybridCraftRepository()
